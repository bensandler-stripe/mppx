import { prepareTransactionRequest, sendCallsSync, signTypedData, signTransaction, } from 'viem/actions';
import { Actions } from 'viem/tempo';
import { tempo as tempo_chain } from 'viem/tempo/chains';
import * as Credential from '../../Credential.js';
import * as Method from '../../Method.js';
import * as Account from '../../viem/Account.js';
import * as Client from '../../viem/Client.js';
import * as z from '../../zod.js';
import * as Attribution from '../Attribution.js';
import * as AutoSwap from '../internal/auto-swap.js';
import * as Charge_internal from '../internal/charge.js';
import * as defaults from '../internal/defaults.js';
import * as Proof from '../internal/proof.js';
import * as Methods from '../Methods.js';
const chargeContextSchema = z.object({
    account: z.optional(z.custom()),
    autoSwap: z.optional(z.custom()),
    mode: z.optional(z.enum(Methods.chargeModes)),
});
// TODO: Remove once the minimum viem version is >=2.54.0, which uses client-first Tempo call builders.
function getTransferCall(client, parameters) {
    const call = Actions.token.transfer.call;
    const result = call.length >= 2 ? call(client, parameters) : call(parameters);
    return result;
}
/**
 * Creates a Tempo charge method intent for usage on the client.
 *
 * @example
 * ```ts
 * import { tempo } from 'mppx/client'
 * import { privateKeyToAccount } from 'viem/accounts'
 *
 * const charge = tempo.charge({
 *   account: privateKeyToAccount('0x...'),
 * })
 * ```
 */
export function charge(parameters = {}) {
    const { clientId } = parameters;
    const getClient = Client.getResolver({
        chain: tempo_chain,
        getClient: parameters.getClient,
        rpcUrl: defaults.rpcUrl,
    });
    const getAccount = Account.getResolver({ account: parameters.account });
    return Method.toClient(Methods.charge, {
        context: chargeContextSchema,
        async createCredential({ challenge, context }) {
            // Chain pinning: reject a challenge whose chain ID conflicts with the
            // pinned one, and sign on the pin when the challenge omits a chain ID.
            const challengeChainId = challenge.request.methodDetails?.chainId;
            if (parameters.expectedChainId !== undefined &&
                challengeChainId !== undefined &&
                challengeChainId !== parameters.expectedChainId)
                throw new Error(`Chain ID mismatch: expected ${parameters.expectedChainId}, got ${challengeChainId}.`);
            const resolvedChainId = challengeChainId ?? parameters.expectedChainId;
            const client = await getClient({ chainId: resolvedChainId });
            const chainId = resolvedChainId ?? client.chain?.id;
            if (chainId === undefined)
                throw new Error('No `chainId` provided. Pass a chain ID in the challenge or client.');
            const { request } = challenge;
            const { amount, methodDetails } = request;
            const supportedModes = methodDetails?.supportedModes ?? ['pull', 'push'];
            const defaultAccount = getAccount(client, context);
            // Zero-amount: sign EIP-712 typed data instead of creating a transaction.
            if (BigInt(amount) === 0n) {
                const signature = await signTypedData(client, {
                    account: defaultAccount,
                    // `account` here is the signing account; the proof's bound payer is
                    // `account.address` (echoed in the credential `source` below).
                    ...Proof.typedData({
                        account: defaultAccount.address,
                        chainId,
                        challengeId: challenge.id,
                        realm: challenge.realm,
                    }),
                });
                return Credential.serialize({
                    challenge,
                    payload: { signature, type: 'proof' },
                    source: Proof.proofSource({ address: defaultAccount.address, chainId }),
                });
            }
            const currency = request.currency;
            if (parameters.expectedRecipients) {
                const allowed = new Set(parameters.expectedRecipients.map((a) => a.toLowerCase()));
                const splits = methodDetails?.splits;
                if (splits) {
                    for (const split of splits) {
                        if (!allowed.has(split.recipient.toLowerCase()))
                            throw new Error(`Unexpected split recipient: ${split.recipient}`);
                    }
                }
            }
            const memo = methodDetails?.memo
                ? methodDetails.memo
                : Attribution.encode({ challengeId: challenge.id, clientId, serverId: challenge.realm });
            const transfers = Charge_internal.getTransfers({
                amount,
                methodDetails: {
                    ...methodDetails,
                    memo,
                },
                recipient: request.recipient,
            });
            const transferCalls = transfers.map((transfer) => getTransferCall(client, {
                amount: BigInt(transfer.amount),
                ...(transfer.memo && { memo: transfer.memo }),
                to: transfer.recipient,
                token: currency,
            }));
            const autoSwap = AutoSwap.resolve(context?.autoSwap ?? parameters.autoSwap, AutoSwap.defaultCurrencies);
            const account = (await parameters.resolveAccount?.({
                account: defaultAccount,
                chainId,
                operation: {
                    kind: 'executeCalls',
                    ...(autoSwap ? {} : { calls: transferCalls }),
                },
            })) ?? defaultAccount;
            const mode = (() => {
                const explicitMode = context?.mode ?? parameters.mode;
                if (explicitMode) {
                    if (!supportedModes.includes(explicitMode))
                        throw new Error(`Challenge does not support ${explicitMode} mode.`);
                    return explicitMode;
                }
                const preferredMode = account.type === 'json-rpc' ? 'push' : 'pull';
                if (supportedModes.includes(preferredMode))
                    return preferredMode;
                return supportedModes[0];
            })();
            const swapCalls = autoSwap
                ? await AutoSwap.findCalls(client, {
                    account: account.address,
                    amountOut: BigInt(amount),
                    tokenOut: currency,
                    tokenIn: autoSwap.tokenIn,
                    slippage: autoSwap.slippage,
                })
                : undefined;
            const calls = [...(swapCalls ?? []), ...transferCalls];
            const validBefore = (() => {
                const defaultExpiry = Math.floor(Date.now() / 1000) + 25;
                if (!challenge.expires)
                    return defaultExpiry;
                const challengeExpiry = Math.floor(new Date(challenge.expires).getTime() / 1000);
                return Math.min(defaultExpiry, challengeExpiry);
            })();
            if (mode === 'push') {
                const { receipts } = await sendCallsSync(client, {
                    account,
                    calls: calls,
                    experimental_fallback: true,
                });
                const hash = receipts?.[0]?.transactionHash;
                if (!hash)
                    throw new Error('No transaction receipt returned.');
                return Credential.serialize({
                    challenge,
                    payload: { hash, type: 'hash' },
                    source: Proof.proofSource({ address: account.address, chainId }),
                });
            }
            const prepared = await prepareTransactionRequest(client, {
                account,
                calls,
                nonceKey: 'expiring',
                validBefore,
            });
            // Estimate before enabling fee-payer mode so Tempo includes sender
            // signature and access-key verification costs in the gas budget.
            prepared.gas = (prepared.gas ?? 0n) + 5000n;
            if (methodDetails?.feePayer) {
                const sponsored = prepared;
                delete sponsored.feePayerSignature;
                delete sponsored.feeToken;
                sponsored.feePayer = true;
            }
            const signature = await signTransaction(client, prepared);
            return Credential.serialize({
                challenge,
                payload: { signature, type: 'transaction' },
                source: Proof.proofSource({ address: account.address, chainId }),
            });
        },
    });
}
//# sourceMappingURL=Charge.js.map