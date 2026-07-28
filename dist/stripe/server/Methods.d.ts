import type * as Method from '../../Method.js';
import { charge as tempoCharge } from '../../tempo/server/Charge.js';
import { session as tempoSession } from '../../tempo/session/server/Session.js';
import { charge as evmCharge } from '../../evm/server/Charge.js';
import { charge as charge_ } from './Charge.js';
type StripeClient = {
    paymentIntents: {
        create: (...args: any[]) => any;
    };
};
type CustomRailFactory = (address: string) => Method.AnyServer | readonly Method.AnyServer[];
type TempoServer = Method.AnyServer & {
    name: 'tempo';
    intent: 'charge';
};
type TempoSessionServer = Method.AnyServer & {
    name: 'tempo';
    intent: 'session';
};
type SptServer = Method.AnyServer & {
    name: 'stripe';
    intent: 'charge';
};
type EvmServer = Method.AnyServer & {
    name: 'evm';
    intent: 'charge';
};
type MethodsResult<C extends MethodsConfig> = readonly [
    ...(C extends {
        spt: object;
    } ? [SptServer] : []),
    ...(C extends {
        tempo: {
            charge: any;
        };
    } ? [TempoServer] : []),
    ...(C extends {
        tempo: {
            session: any;
        };
    } ? [TempoSessionServer] : []),
    ...(C extends {
        base: object;
    } ? [EvmServer] : []),
    ...Method.AnyServer[]
];
type DefaultMethodsConfig = {
    base?: BaseConfig;
    additional?: Record<string, CustomRailFactory>;
};
type DefaultMethodsResult<C extends DefaultMethodsConfig> = readonly [
    TempoServer,
    SptServer,
    ...(C extends {
        base: object;
    } ? [EvmServer] : []),
    ...Method.AnyServer[]
];
interface StripeMachinePayments {
    spt: {
        charge: typeof charge_;
    };
    tempo: {
        charge: (params?: Partial<Omit<Parameters<typeof tempoCharge>[0], 'currency' | 'recipient'>>) => TempoServer;
        session: (params: Omit<Parameters<typeof tempoSession>[0], 'currency' | 'recipient'>) => TempoSessionServer;
    };
    base: {
        charge: (params: BaseConfig) => EvmServer;
    };
    methods: <C extends MethodsConfig>(config: C) => MethodsResult<C>;
    /**
     * Returns all default payment methods (tempo charge + SPT) plus any additional custom rails.
     * Use this when you want maximum coverage with minimal config.
     */
    defaultMethods: <C extends DefaultMethodsConfig>(config?: C) => DefaultMethodsResult<C>;
}
type BaseConfig = {
    x402: Omit<NonNullable<Parameters<typeof evmCharge>[0]['x402']>, never>;
} & Partial<Omit<Parameters<typeof evmCharge>[0], 'currency' | 'recipient' | 'x402'>>;
type MethodsConfig = {
    spt?: {
        charge?: boolean | Omit<Parameters<typeof charge_>[0], 'secretKey' | 'networkId'>;
    };
    tempo?: {
        currency?: `0x${string}`;
        charge?: boolean | Partial<Omit<Parameters<typeof tempoCharge>[0], 'currency' | 'recipient'>>;
        session?: Omit<Parameters<typeof tempoSession>[0], 'currency' | 'recipient'>;
    };
    base?: BaseConfig;
} & {
    [network: string]: CustomRailFactory | undefined | {
        charge?: any;
        session?: any;
        currency?: any;
        x402?: any;
    };
};
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
export declare function stripe<const parameters extends stripe.Parameters>(parameters: parameters): Promise<StripeMachinePayments>;
export declare namespace stripe {
    type Parameters = {
        /** Pre-configured Stripe SDK client. */
        client?: StripeClient | undefined;
        /** Stripe secret API key. */
        secretKey: string;
        /** Stripe business network profile ID (used by .methods() and .defaultMethods()). */
        networkId: string;
    };
}
export declare namespace stripe {
    /** Creates a Stripe SPT charge method for card/link payments. */
    const spt: typeof charge_;
    /** @deprecated Use `stripe.spt()` or `stripe.create()` instead. */
    const charge: typeof charge_;
    const create: typeof stripe;
}
export {};
//# sourceMappingURL=Methods.d.ts.map