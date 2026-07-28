/**
 * Server-side TIP-1034 precompile session payment method for request/response flows.
 *
 * Handles the full TIP20EscrowChannel lifecycle (open, voucher, top-up, close)
 * and one-shot settlement. Each incoming request carries a session credential
 * with a cumulative voucher that the server validates and records.
 */
import { isAddress } from 'viem';
import { tempo as tempo_chain } from 'viem/chains';
import * as Challenge from '../../../Challenge.js';
import * as Constants from '../../../Constants.js';
import * as Errors from '../../../Errors.js';
import * as Expires from '../../../Expires.js';
import * as Method from '../../../Method.js';
import * as Store from '../../../Store.js';
import * as Client from '../../../viem/Client.js';
import * as Account from '../../internal/account.js';
import * as defaults from '../../internal/defaults.js';
import * as Methods from '../../Methods.js';
import * as ChargeServer from '../../server/Charge.js';
import * as Transport from '../../server/internal/transport.js';
import { tip20ChannelEscrow } from '../precompile/Protocol.js';
import { deserializeSnapshot as deserializeSessionSnapshot, serializeSnapshot as serializeSessionSnapshot, } from '../Snapshot.js';
import * as ChannelStore from './ChannelStore.js';
import { verifyCredentialPayload } from './CredentialVerification.js';
import { requireSessionCredentialPayload } from './CredentialVerification.js';
import { resolveCredentialVerificationContext, resolveSessionChannelId, resolveSessionSnapshot, resolveSessionPaymentRequest, } from './RequestState.js';
import { respondToSessionCredential } from './RequestState.js';
import { applyVerifiedHttpAccounting, chargeSessionChannel } from './Settlement.js';
import { maybeSettleScheduled } from './Settlement.js';
import { resolveSettlementSchedule, } from './Settlement.js';
export { settle, settleBatch } from './Settlement.js';
function deriveServerDefaults(values) {
    // `Method.toServer()` models defaults from request input fields. Tempo session
    // defaults are assembled after account/currency resolution, so keep the
    // unavoidable generic bridge in one place instead of the control-flow body.
    return values;
}
function deriveTransport(transport) {
    return transport;
}
async function resolveBootstrapChargeRequest(parameters) {
    const { decimals, defaultRecipient, getClient, parameterChainId, paymentRequest } = parameters;
    const chainId = paymentRequest.chainId ?? parameterChainId ?? (await getClient({})).chain?.id;
    return {
        amount: '0',
        ...(chainId !== undefined ? { chainId } : {}),
        currency: paymentRequest.currency,
        decimals,
        recipient: paymentRequest.recipient ?? defaultRecipient,
    };
}
function isBootstrapChargeCredential(credential) {
    return (credential?.challenge.method === Constants.Methods.tempo &&
        credential.challenge.intent === Constants.Intents.charge);
}
function createBootstrapChallenge(parameters) {
    return Challenge.fromMethod(Methods.charge, {
        expires: parameters.expires,
        realm: parameters.realm,
        request: parameters.request,
        secretKey: parameters.secretKey,
    });
}
function respondBootstrapChallenge(challenge, error) {
    const headers = new Headers({
        [Constants.Headers.wwwAuthenticate]: Challenge.serialize(challenge),
        'Cache-Control': 'no-store',
    });
    if (!error)
        return new Response(null, { status: 402, headers });
    headers.set('Content-Type', 'application/problem+json');
    return new Response(JSON.stringify(error.toProblemDetails(challenge.id)), {
        status: error.status,
        headers,
    });
}
function assertBootstrapChallengeMatches(expected, actual) {
    if (actual.method !== Constants.Methods.tempo || actual.intent !== Constants.Intents.charge)
        throw new Errors.InvalidChallengeError({ id: actual.id, reason: 'not a bootstrap challenge' });
    if (!sameRequestValue(expected.request.amount, actual.request.amount))
        throw new Errors.InvalidChallengeError({ id: actual.id, reason: 'bootstrap amount mismatch' });
    if (!sameRequestValue(expected.request.currency, actual.request.currency))
        throw new Errors.InvalidChallengeError({ id: actual.id, reason: 'bootstrap currency mismatch' });
    if (!sameRequestValue(expected.request.recipient, actual.request.recipient))
        throw new Errors.InvalidChallengeError({
            id: actual.id,
            reason: 'bootstrap recipient mismatch',
        });
    const expectedChainId = readMethodDetail(expected.request, 'chainId');
    const actualChainId = readMethodDetail(actual.request, 'chainId');
    if (!sameRequestValue(expectedChainId, actualChainId))
        throw new Errors.InvalidChallengeError({ id: actual.id, reason: 'bootstrap chain mismatch' });
}
function readMethodDetail(request, key) {
    if (!request || typeof request !== 'object')
        return undefined;
    const methodDetails = request.methodDetails;
    if (!methodDetails || typeof methodDetails !== 'object')
        return undefined;
    return methodDetails[key];
}
function sameRequestValue(a, b) {
    return a === b || (a === undefined && b === undefined);
}
function readBootstrapAddress(value, label) {
    if (typeof value === 'string' && isAddress(value, { strict: false }))
        return value;
    throw new Errors.VerificationFailedError({ reason: `missing bootstrap ${label}` });
}
function resolveBootstrapEscrowContract(paymentRequest, parameterEscrowContract) {
    const requestEscrow = paymentRequest.escrowContract;
    if (requestEscrow === undefined)
        return parameterEscrowContract ?? tip20ChannelEscrow;
    return readBootstrapAddress(requestEscrow, 'escrowContract');
}
function readBootstrapChainId(value) {
    if (typeof value === 'number')
        return value;
    throw new Errors.VerificationFailedError({ reason: 'missing bootstrap chainId' });
}
async function verifyBootstrapCredential(parameters) {
    const { challenge, charge, credential, rawRequest, secretKey } = parameters;
    if (!Challenge.verify(credential.challenge, { secretKey }))
        throw new Errors.InvalidChallengeError({
            id: credential.challenge.id,
            reason: 'challenge was not issued by this server',
        });
    Expires.assert(credential.challenge.expires, credential.challenge.id);
    assertBootstrapChallengeMatches(challenge, credential.challenge);
    return charge.verify({
        credential: {
            ...credential,
            payload: Methods.charge.schema.credential.payload.parse(credential.payload),
        },
        request: rawRequest,
    });
}
async function handleBootstrapPreflight(parameters) {
    const request = await resolveBootstrapChargeRequest(parameters);
    const challenge = createBootstrapChallenge({
        expires: parameters.expires,
        realm: parameters.realm,
        request,
        secretKey: parameters.secretKey,
    });
    if (!parameters.credential)
        return respondBootstrapChallenge(challenge);
    if (!isBootstrapChargeCredential(parameters.credential))
        return undefined;
    try {
        await verifyBootstrapCredential({
            challenge,
            charge: parameters.charge,
            credential: parameters.credential,
            rawRequest: request,
            secretKey: parameters.secretKey,
        });
    }
    catch (error) {
        return respondBootstrapChallenge(challenge, error instanceof Errors.PaymentError ? error : new Errors.VerificationFailedError());
    }
    const channelId = await resolveSessionChannelId({
        capturedRequest: parameters.capturedRequest,
        credential: parameters.credential,
        request: parameters.paymentRequest,
        resolveChannelId: parameters.resolveChannelId,
        source: parameters.credential.source,
        store: parameters.store,
    });
    const snapshot = await resolveSessionSnapshot({
        amount: 0n,
        channelId,
        expected: {
            chainId: readBootstrapChainId(request.chainId),
            currency: readBootstrapAddress(request.currency, 'currency'),
            escrowContract: resolveBootstrapEscrowContract(parameters.paymentRequest, parameters.parameterEscrowContract),
            recipient: readBootstrapAddress(request.recipient, 'recipient'),
        },
        store: parameters.store,
    });
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    if (snapshot) {
        headers.set(Constants.Headers.paymentSession, snapshot.channelId);
        headers.set(Constants.Headers.paymentSessionSnapshot, serializeSessionSnapshot(snapshot));
    }
    return new Response(null, { status: 204, headers });
}
/** Creates a server-side TIP20EscrowChannel precompile session payment method. */
export function session(p) {
    const parameters = p;
    const { amount, channelStateTtl = 5_000, currency = defaults.resolveCurrency(parameters), decimals = defaults.decimals, operator, store: rawStore = Store.memory(), suggestedDeposit, unitType, } = parameters;
    const settlementSchedule = resolveSettlementSchedule(parameters.settlementSchedule, decimals);
    const onSessionSettlement = parameters.onSessionSettlement;
    const store = ChannelStore.fromStore(rawStore);
    const lastOnChainVerified = new Map();
    const { account, feePayer, feePayerUrl, recipient } = Account.resolve(parameters);
    const configuredFeePayer = feePayer ?? feePayerUrl;
    const getClient = Client.getResolver({
        chain: tempo_chain,
        feePayerUrl,
        getClient: parameters.getClient,
        rpcUrl: defaults.rpcUrl,
    });
    const bootstrapCharge = ChargeServer.charge({
        account,
        chainId: parameters.chainId,
        currency,
        decimals,
        feePayer: parameters.feePayer,
        getClient: parameters.getClient,
        recipient,
        store: rawStore,
    });
    const transport = parameters.sse
        ? Transport.sse({
            store,
            ...(typeof parameters.sse === 'object' ? parameters.sse : undefined),
        })
        : undefined;
    return Method.toServer(Methods.session, {
        defaults: deriveServerDefaults({
            amount,
            currency,
            decimals,
            operator,
            recipient,
            suggestedDeposit,
            unitType,
        }),
        transport: deriveTransport(transport),
        preflight: parameters.bootstrap
            ? async ({ capturedRequest, credential, expires, input, options, realm, secretKey }) => {
                if (input.method !== 'HEAD')
                    return undefined;
                return handleBootstrapPreflight({
                    capturedRequest,
                    credential,
                    input,
                    charge: bootstrapCharge,
                    decimals,
                    defaultRecipient: recipient,
                    expires,
                    getClient,
                    parameterChainId: parameters.chainId,
                    parameterEscrowContract: parameters.escrowContract,
                    paymentRequest: options,
                    realm,
                    resolveChannelId: parameters.resolveChannelId,
                    secretKey,
                    store,
                });
            }
            : undefined,
        async request({ capturedRequest, credential, request }) {
            const resolvedRequest = await resolveSessionPaymentRequest({
                capturedRequest,
                credential,
                decimals,
                defaultFeePayer: feePayer,
                getClient,
                parameterChainId: parameters.chainId,
                parameterEscrowContract: parameters.escrowContract,
                parameterFeePayer: parameters.feePayer,
                request,
                resolveChannelId: parameters.resolveChannelId,
                store,
            });
            return {
                ...resolvedRequest,
                sessionProtocol: Constants.SessionProtocols.v2,
            };
        },
        async verify({ credential, envelope, request }) {
            const { challenge } = credential;
            const payload = requireSessionCredentialPayload(credential.payload);
            const context = await resolveCredentialVerificationContext({
                decimals,
                feePayer: configuredFeePayer,
                getClient,
                minVoucherDelta: parameters.minVoucherDelta,
                request,
            });
            const sessionReceipt = await verifyCredentialPayload({
                account,
                challenge,
                channelStateTtl,
                chainId: context.chainId,
                client: context.client,
                credentialSource: credential.source,
                escrow: context.escrow,
                expectedOperator: context.methodDetails.operator,
                feePayer: context.feePayer,
                feePayerPolicy: parameters.feePayerPolicy,
                feeToken: parameters.feeToken,
                lastOnChainVerified,
                minVoucherDelta: context.minVoucherDelta,
                onSessionSettlement,
                payload,
                store,
            });
            return applyVerifiedHttpAccounting({
                capturedRequest: envelope?.capturedRequest,
                payloadAction: payload.action,
                receipt: sessionReceipt,
                getRequestAmount: () => BigInt(context.request.amount ?? challenge.request.amount),
                sseEnabled: Boolean(parameters.sse),
                markPrepaidReceipt: Transport.markPrepaidSessionTick,
                charge: (channelId, requestAmount) => chargeSessionChannel({ store, channelId, amount: requestAmount }),
                settleCharged: (channel) => maybeSettleScheduled({
                    account,
                    client: context.client,
                    ...(typeof context.feePayer === 'object' ? { feePayer: context.feePayer } : {}),
                    feePayerPolicy: parameters.feePayerPolicy,
                    feeToken: parameters.feeToken,
                    onSessionSettlement,
                    schedule: settlementSchedule,
                    store,
                    channel,
                }),
            });
        },
        // This hook acts as a gate: when it returns a Response, `withReceipt()`
        // in Mppx.ts short-circuits and returns that response directly without
        // invoking the user's route handler. When it returns undefined, the
        // user's handler runs normally and serves content.
        //
        // close and topUp are always gated (204) — they are pure management.
        //
        // open and voucher share the same captured-request classifier used
        // during verification. Non-billable requests are treated as management
        // updates; billable requests fall through to the application handler.
        respond({ credential, envelope, input }) {
            return respondToSessionCredential({
                capturedRequest: envelope?.capturedRequest,
                input,
                payload: credential.payload,
            });
        },
    });
}
(function (session) {
    session.serializeSnapshot = serializeSessionSnapshot;
    session.deserializeSnapshot = deserializeSessionSnapshot;
})(session || (session = {}));
/**
 * Charge against a precompile-backed channel's balance.
 *
 * Exported so consumers can deduct from a channel outside the `session()`
 * handler.
 *
 * Delegates to the shared `deductFromChannel` atomic helper and translates
 * failure modes into typed errors (`InsufficientBalanceError`, `ChannelClosedError`).
 */
export async function charge(store, channelId, amount) {
    return chargeSessionChannel({ store, channelId, amount });
}
//# sourceMappingURL=Session.js.map