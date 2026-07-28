import * as tempoDefaults from '../../tempo/internal/defaults.js';
import { charge as tempoCharge } from '../../tempo/server/Charge.js';
import { session as tempoSession } from '../../tempo/session/server/Session.js';
import { charge as evmCharge } from '../../evm/server/Charge.js';
import * as EvmAssets from '../../evm/Assets.js';
import { charge as charge_ } from './Charge.js';
import { resolveDepositAddress } from './internal/deposit-address.js';
import { recordCryptoPayment } from './internal/record-payment.js';
/**
 * Creates a configured Stripe machine payments instance.
 *
 * Resolves deposit addresses eagerly so all subsequent method calls are synchronous.
 * Methods returned from this instance automatically record crypto payments as
 * Stripe PaymentIntents via transaction verification.
 *
 * @example
 * ```ts
 * import { Mppx, stripe } from 'mppx/server'
 * import { solana } from '@solana/mpp/server'
 *
 * const machinePayments = await stripe.create({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   networkId: process.env.STRIPE_PROFILE_ID!,
 * })
 *
 * // Option 1: Auto-enable defaults (tempo + SPT) with additional custom rails
 * const mppx = Mppx.create({
 *   methods: machinePayments.defaultMethods({
 *     additional: {
 *       solana: (address) => solana.charge({ recipient: address, currency: USDC, decimals: 6 }),
 *     },
 *   }),
 *   secretKey: mppSecretKey,
 * })
 * ```
 *
 * @example
 * ```ts
 * // Option 2: Declare exactly which methods you want
 * const mppx = Mppx.create({
 *   methods: machinePayments.methods({
 *     spt: { charge: true },
 *     tempo: { charge: true },
 *     base: { x402: { facilitator } },
 *     solana: (address) => solana.charge({ recipient: address, currency: USDC, decimals: 6 }),
 *   }),
 *   secretKey: mppSecretKey,
 * })
 * ```
 *
 * @example
 * ```ts
 * // Option 3: Use individual method factories for full control
 * const mppx = Mppx.create({
 *   methods: [
 *     machinePayments.spt.charge({ secretKey, networkId, paymentMethodTypes: ['card', 'link'] }),
 *     machinePayments.tempo.charge(),
 *     machinePayments.base.charge({ x402: { facilitator } }),
 *     solana.charge({ recipient: solanaAddress, currency: USDC, decimals: 6, network: 'mainnet-beta' }),
 *   ],
 *   secretKey: mppSecretKey,
 * })
 * ```
 */
export async function stripe(parameters) {
    const { secretKey, networkId } = parameters;
    const isTestMode = secretKey.includes('_test_');
    // Eagerly resolve all deposit addresses
    const addresses = await resolveAllDepositAddresses(secretKey);
    const tempoAddress = addresses.get('tempo') ?? null;
    const baseAddress = addresses.get('base') ?? null;
    function makeTempoCharge(params) {
        if (!tempoAddress) {
            throw new Error('stripe: no Tempo deposit address available. Ensure crypto is enabled on your Stripe account.');
        }
        const method = tempoCharge({
            currency: (isTestMode
                ? tempoDefaults.tokens.pathUsd
                : tempoDefaults.tokens.usdc),
            recipient: tempoAddress,
            ...(isTestMode && { testnet: true }),
            ...params,
        });
        return withPaymentRecording(method, secretKey);
    }
    function makeTempoSession(params) {
        if (!tempoAddress) {
            throw new Error('stripe: no Tempo deposit address available. Ensure crypto is enabled on your Stripe account.');
        }
        const method = tempoSession({
            currency: (isTestMode
                ? tempoDefaults.tokens.pathUsd
                : tempoDefaults.tokens.usdc),
            recipient: tempoAddress,
            ...(isTestMode && { testnet: true }),
            ...params,
        });
        return withPaymentRecording(method, secretKey);
    }
    function makeBaseCharge(params) {
        if (!baseAddress) {
            throw new Error('stripe: no Base deposit address available. Ensure crypto is enabled on your Stripe account.');
        }
        const { x402, ...rest } = params;
        const method = evmCharge({
            currency: isTestMode ? EvmAssets.baseSepolia.USDC : EvmAssets.base.USDC,
            recipient: baseAddress,
            x402,
            ...rest,
        });
        return withPaymentRecording(method, secretKey);
    }
    function makeSptCharge(params) {
        return charge_(params);
    }
    function methods(config) {
        const result = [];
        // SPT
        if (config.spt?.charge) {
            const sptConfig = config.spt.charge === true ? {} : config.spt.charge;
            result.push(makeSptCharge({
                secretKey: secretKey,
                networkId: networkId,
                paymentMethodTypes: ['card', 'link'],
                ...sptConfig,
            }));
        }
        // Tempo
        if (config.tempo) {
            const tempoCurrency = config.tempo.currency ?? (isTestMode
                ? tempoDefaults.tokens.pathUsd
                : tempoDefaults.tokens.usdc);
            if (config.tempo.charge) {
                const chargeConfig = config.tempo.charge === true ? {} : config.tempo.charge;
                result.push(makeTempoCharge({ ...chargeConfig }));
            }
            if (config.tempo.session) {
                result.push(makeTempoSession(config.tempo.session));
            }
        }
        // Base (EVM)
        if (config.base) {
            const address = addresses.get('base');
            if (address) {
                const { x402, ...baseRest } = config.base;
                const method = evmCharge({
                    currency: isTestMode ? EvmAssets.baseSepolia.USDC : EvmAssets.base.USDC,
                    recipient: address,
                    x402,
                    ...baseRest,
                });
                result.push(withPaymentRecording(method, secretKey));
            }
        }
        // Custom rails
        for (const [network, value] of Object.entries(config)) {
            if (network === 'spt' || network === 'tempo' || network === 'base')
                continue;
            if (typeof value !== 'function')
                continue;
            const address = addresses.get(network);
            if (!address)
                continue;
            const methodOrMethods = value(address);
            const methods = Array.isArray(methodOrMethods)
                ? methodOrMethods
                : [methodOrMethods];
            for (const m of methods) {
                result.push(withPaymentRecording(m, secretKey));
            }
        }
        return result;
    }
    function defaultMethods(config) {
        const result = [
            makeTempoCharge(),
            makeSptCharge({
                secretKey: secretKey,
                networkId: networkId,
                paymentMethodTypes: ['card', 'link'],
            }),
        ];
        if (config?.base) {
            result.push(makeBaseCharge(config.base));
        }
        if (config?.additional) {
            for (const [network, factory] of Object.entries(config.additional)) {
                const address = addresses.get(network);
                if (!address)
                    continue;
                const methodOrMethods = factory(address);
                const methods = Array.isArray(methodOrMethods)
                    ? methodOrMethods
                    : [methodOrMethods];
                for (const m of methods) {
                    result.push(withPaymentRecording(m, secretKey));
                }
            }
        }
        return result;
    }
    return {
        spt: { charge: charge_ },
        tempo: {
            charge: makeTempoCharge,
            session: makeTempoSession,
        },
        base: {
            charge: makeBaseCharge,
        },
        methods,
        defaultMethods,
    };
}
(function (stripe) {
    /** Creates a Stripe SPT charge method for card/link payments. */
    stripe.spt = charge_;
    /** @deprecated Use `stripe.spt()` or `stripe.create()` instead. */
    stripe.charge = charge_;
    stripe.create = stripe;
})(stripe || (stripe = {}));
/**
 * Resolves all deposit addresses for the account.
 */
async function resolveAllDepositAddresses(secretKey) {
    const networks = ['tempo', 'base', 'solana'];
    const results = await Promise.all(networks.map(async (network) => ({
        network,
        address: await resolveDepositAddress(secretKey, network),
    })));
    const map = new Map();
    for (const { network, address } of results) {
        if (address)
            map.set(network, address);
    }
    return map;
}
/**
 * Adds a respond hook to record crypto payments as Stripe PaymentIntents.
 * The respond hook fires after verify succeeds and has access to both
 * the receipt (tx hash) and the request (amount in atomic units).
 */
function withPaymentRecording(method, secretKey) {
    const originalRespond = method.respond;
    const wrapped = {
        ...method,
        async respond(params) {
            const { receipt, request } = params;
            if (receipt?.reference && request?.amount) {
                recordCryptoPayment({
                    secretKey,
                    method: receipt.method,
                    reference: receipt.reference,
                    amount: String(request.amount),
                });
            }
            return originalRespond?.(params);
        },
    };
    return wrapped;
}
//# sourceMappingURL=Methods.js.map