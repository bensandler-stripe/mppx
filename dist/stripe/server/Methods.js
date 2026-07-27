import * as tempoDefaults from '../../tempo/internal/defaults.js';
import { charge as tempoCharge } from '../../tempo/server/Charge.js';
import { charge as evmCharge } from '../../evm/server/Charge.js';
import * as EvmAssets from '../../evm/Assets.js';
import { charge as charge_ } from './Charge.js';
import { resolveDepositAddress } from './internal/deposit-address.js';
import { recordCryptoPayment } from './internal/record-payment.js';
/**
 * Creates all Stripe-supported MPP payment methods from a single configuration.
 *
 * Opinionated: always enables Tempo crypto and SPT (card/link) payments.
 * Pass `additional` to enable more crypto networks (e.g. Base, Solana).
 *
 * Crypto payments are automatically recorded as Stripe PaymentIntents
 * via transaction verification for unified accounting in the Stripe Dashboard.
 *
 * @example
 * ```ts
 * import { Mppx, stripe } from 'mppx/server'
 *
 * // Minimal: tempo + cards/link
 * const mppx = Mppx.create({
 *   methods: [await stripe({ secretKey: 'sk_...', profileId: '...' })],
 * })
 * ```
 *
 * @example
 * ```ts
 * import { stripe } from 'mppx/server'
 * import { solana } from '@solana/mpp/server'
 *
 * // Add Base and Solana
 * const methods = await stripe({
 *   secretKey: 'sk_...',
 *   profileId: '...',
 *   additional: [
 *     { network: 'base', x402: { facilitator } },
 *     { network: 'solana', configure: (address) => solana.charge({ recipient: address, currency: USDC, decimals: 6 }) },
 *   ],
 * })
 * ```
 */
export async function stripe(parameters) {
    const { secretKey, profileId, paymentMethodTypes } = parameters;
    const methods = [];
    // Crypto methods: tempo is always on, additional networks are merged
    const cryptoMethods = await stripe.crypto({ secretKey, additional: parameters.additional });
    methods.push(...cryptoMethods);
    // SPT method: always on
    methods.push(stripe.spt({
        secretKey,
        networkId: profileId,
        paymentMethodTypes: paymentMethodTypes ?? ['card', 'link'],
    }));
    return methods;
}
(function (stripe) {
    /**
     * Creates crypto payment methods. Tempo is always included.
     * Additional entries are merged, with duplicates resolved by preferring the additional entry.
     */
    async function crypto(parameters) {
        const { secretKey, additional = [] } = parameters;
        const isTestMode = secretKey.includes('_test_');
        // Built-in defaults
        const defaults = [{ network: 'tempo' }];
        // Merge: additional entries override defaults with the same network name
        const networkMap = new Map();
        for (const entry of defaults) {
            networkMap.set(entry.network, entry);
        }
        for (const entry of additional) {
            networkMap.set(entry.network, entry);
        }
        // Resolve all deposit addresses in parallel
        const entries = [...networkMap.values()];
        const resolved = await Promise.all(entries.map(async (entry) => ({
            entry,
            address: await resolveDepositAddress(secretKey, entry.network),
        })));
        const methods = [];
        for (const { entry, address } of resolved) {
            if (!address)
                continue;
            let methodOrMethods;
            if ('configure' in entry) {
                methodOrMethods = entry.configure(address);
            }
            else if (entry.network === 'tempo') {
                const { network: _, ...config } = entry;
                methodOrMethods = tempoCharge({
                    currency: (isTestMode
                        ? tempoDefaults.tokens.pathUsd
                        : tempoDefaults.tokens.usdc),
                    recipient: address,
                    ...(isTestMode && { testnet: true }),
                    ...config,
                });
            }
            else if (entry.network === 'base') {
                const { network: _, ...config } = entry;
                methodOrMethods = evmCharge({
                    currency: isTestMode ? EvmAssets.baseSepolia.USDC : EvmAssets.base.USDC,
                    recipient: address,
                    ...config,
                });
            }
            else {
                continue;
            }
            // Wrap with Stripe payment recording
            const wrapped = Array.isArray(methodOrMethods)
                ? methodOrMethods.map((m) => wrapWithPaymentRecording(m, secretKey))
                : [wrapWithPaymentRecording(methodOrMethods, secretKey)];
            methods.push(...wrapped);
        }
        return methods;
    }
    stripe.crypto = crypto;
    /** Creates a Stripe SPT charge method for card/link payments. */
    stripe.spt = charge_;
    /** @deprecated Use `stripe.spt()` instead. */
    stripe.charge = charge_;
})(stripe || (stripe = {}));
/**
 * Wraps a method's verify function to record successful crypto payments
 * as Stripe PaymentIntents via transaction_verification.
 */
function wrapWithPaymentRecording(method, secretKey) {
    const originalVerify = method.verify;
    return {
        ...method,
        async verify(params) {
            const receipt = await originalVerify(params);
            const request = params.credential?.challenge?.request ?? params.request;
            const amount = request?.amount;
            if (receipt.reference && amount) {
                recordCryptoPayment({
                    secretKey,
                    method: receipt.method,
                    reference: receipt.reference,
                    amount: String(amount),
                });
            }
            return receipt;
        },
    };
}
//# sourceMappingURL=Methods.js.map