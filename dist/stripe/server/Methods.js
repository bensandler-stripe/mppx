import crypto from 'node:crypto';
import * as Mppx from '../../server/Mppx.js';
import * as tempoDefaults from '../../tempo/internal/defaults.js';
import { charge as tempoCharge } from '../../tempo/server/Charge.js';
import { charge as evmCharge } from '../../evm/server/Charge.js';
import * as EvmAssets from '../../evm/Assets.js';
import { charge as charge_ } from './Charge.js';
import { resolveDepositAddress } from './internal/deposit-address.js';
import { recordCryptoPayment } from './internal/record-payment.js';
/**
 * Creates a fully configured Mppx server with all Stripe-supported payment methods.
 *
 * Opinionated: always enables Tempo crypto and SPT (card/link) payments.
 * Pass `additional` to enable more crypto networks (e.g. Base, Solana).
 *
 * Crypto payments are automatically recorded as Stripe PaymentIntents
 * via transaction verification for unified accounting in the Stripe Dashboard.
 *
 * @example
 * ```ts
 * import { stripe } from 'mppx/server'
 *
 * const mppx = await stripe({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   profileId: process.env.STRIPE_PROFILE_ID!,
 * })
 *
 * export async function POST(request: Request) {
 *   const result = await mppx.compose(
 *     ['tempo/charge', { amount: '0.01', description: 'API call' }],
 *     ['stripe/charge', { amount: '0.50', currency: 'usd', decimals: 2, description: 'API call' }],
 *   )(request)
 *   if (result.status === 402) return result.challenge
 *   return result.withReceipt(Response.json({ data: '...' }))
 * }
 * ```
 *
 * @example
 * ```ts
 * import { stripe } from 'mppx/server'
 * import { solana } from '@solana/mpp/server'
 *
 * const mppx = await stripe({
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
    const { secretKey, profileId, paymentMethodTypes, realm } = parameters;
    const isTestMode = secretKey.includes('_test_');
    const mppSecretKey = parameters.mppSecretKey
        ?? crypto.createHmac('sha256', secretKey).update('mpp-challenge-signing').digest('base64');
    // Resolve tempo deposit address (required)
    const tempoAddress = await resolveDepositAddress(secretKey, 'tempo');
    if (!tempoAddress) {
        throw new Error('stripe(): failed to resolve Tempo deposit address. Ensure your Stripe account has crypto enabled.');
    }
    // Create tempo method (always on)
    const tempoMethod = tempoCharge({
        currency: (isTestMode
            ? tempoDefaults.tokens.pathUsd
            : tempoDefaults.tokens.usdc),
        recipient: tempoAddress,
        ...(isTestMode && { testnet: true }),
    });
    // Create SPT method (always on)
    const sptMethod = stripe.spt({
        secretKey,
        networkId: profileId,
        paymentMethodTypes: paymentMethodTypes ?? ['card', 'link'],
    });
    // Resolve additional networks (best-effort)
    const additional = await resolveAdditionalNetworks(secretKey, isTestMode, parameters.additional);
    const methods = [tempoMethod, sptMethod, ...additional];
    const mppx = Mppx.create({ methods, secretKey: mppSecretKey, realm });
    // Record crypto payments as Stripe PaymentIntents via transaction verification
    mppx.onPaymentSuccess(({ receipt, request }) => {
        const amount = request?.amount;
        if (receipt.reference && amount) {
            recordCryptoPayment({
                secretKey,
                method: receipt.method,
                reference: receipt.reference,
                amount: String(amount),
            });
        }
    });
    return mppx;
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
        if (Array.isArray(methodOrMethods)) {
            methods.push(...methodOrMethods);
        }
        else {
            methods.push(methodOrMethods);
        }
    }
    return methods;
}
//# sourceMappingURL=Methods.js.map