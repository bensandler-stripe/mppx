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
 * import Stripe from 'stripe'
 *
 * const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!)
 * const machinePayments = await stripe.create({ client: stripeClient })
 *
 * const mppx = Mppx.create({
 *   methods: [
 *     machinePayments.spt.charge({ networkId: '...', paymentMethodTypes: ['card', 'link'] }),
 *     machinePayments.tempo.charge(),
 *   ],
 * })
 * ```
 *
 * @example
 * ```ts
 * // Bundle sugar
 * const machinePayments = await stripe.create({ client: stripeClient })
 *
 * const mppx = Mppx.create({
 *   methods: machinePayments.methods({
 *     spt: { charge: true },
 *     tempo: { currency: USDC, charge: true, session: { store } },
 *     solana: (address) => solana.charge({ recipient: address, currency: USDC, decimals: 6 }),
 *   }),
 * })
 * ```
 */
export async function stripe(parameters) {
    const { client, secretKey, networkId } = parameters;
    const resolvedSecretKey = secretKey ?? extractSecretKey(client);
    const isTestMode = resolvedSecretKey.includes('_test_');
    // Eagerly resolve all deposit addresses
    const addresses = await resolveAllDepositAddresses(resolvedSecretKey);
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
        return wrapWithPaymentRecording(method, resolvedSecretKey);
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
        return wrapWithPaymentRecording(method, resolvedSecretKey);
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
        return wrapWithPaymentRecording(method, resolvedSecretKey);
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
                secretKey: resolvedSecretKey,
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
                result.push(wrapWithPaymentRecording(method, resolvedSecretKey));
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
                result.push(wrapWithPaymentRecording(m, resolvedSecretKey));
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
 * Attempts to extract the secret key from a Stripe client instance.
 */
function extractSecretKey(client) {
    const c = client;
    if (c._api_key)
        return c._api_key;
    if (c.apiKey)
        return c.apiKey;
    throw new Error('stripe.create: could not extract secret key from client. Pass `secretKey` explicitly.');
}
/**
 * Wraps a method's verify to record crypto payments as Stripe PaymentIntents.
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