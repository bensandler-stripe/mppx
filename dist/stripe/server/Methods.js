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
    const isTestMode = secretKey.includes('_test_');
    // Resolve tempo deposit address (required)
    const tempoAddress = await resolveDepositAddress(secretKey, 'tempo');
    if (!tempoAddress) {
        throw new Error('stripe(): failed to resolve Tempo deposit address. Ensure your Stripe account has crypto enabled.');
    }
    // Create tempo method (always on)
    const tempoMethod = wrapWithPaymentRecording(tempoCharge({
        currency: (isTestMode
            ? tempoDefaults.tokens.pathUsd
            : tempoDefaults.tokens.usdc),
        recipient: tempoAddress,
        ...(isTestMode && { testnet: true }),
    }), secretKey);
    // Create SPT method (always on)
    const sptMethod = stripe.spt({
        secretKey,
        networkId: profileId,
        paymentMethodTypes: paymentMethodTypes ?? ['card', 'link'],
    });
    // Resolve additional networks (best-effort)
    const additional = await resolveAdditionalNetworks(secretKey, isTestMode, parameters.additional);
    return [tempoMethod, sptMethod, ...additional];
}
(function (stripe) {
    /** Creates a Stripe SPT charge method for card/link payments. */
    stripe.spt = charge_;
    /** @deprecated Use `stripe.spt()` instead. */
    stripe.charge = charge_;
})(stripe || (stripe = {}));
async function resolveAdditionalNetworks(secretKey, isTestMode, additional) {
    if (!additional || additional.length === 0)
        return [];
    const methods = [];
    const resolved = await Promise.all(additional
        .filter((entry) => entry.network !== 'tempo')
        .map(async (entry) => ({
        entry,
        address: await resolveDepositAddress(secretKey, entry.network),
    })));
    for (const { entry, address } of resolved) {
        if (!address)
            continue;
        let methodOrMethods;
        if ('configure' in entry) {
            methodOrMethods = entry.configure(address);
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
        const wrapped = Array.isArray(methodOrMethods)
            ? methodOrMethods.map((m) => wrapWithPaymentRecording(m, secretKey))
            : [wrapWithPaymentRecording(methodOrMethods, secretKey)];
        methods.push(...wrapped);
    }
    return methods;
}
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