import type * as Method from '../../Method.js';
import * as Mppx from '../../server/Mppx.js';
import { charge as tempoCharge } from '../../tempo/server/Charge.js';
import { charge as evmCharge } from '../../evm/server/Charge.js';
import { charge as charge_ } from './Charge.js';
type TempoNetworkEntry = {
    network: 'tempo';
} & Partial<Omit<Parameters<typeof tempoCharge>[0], 'currency' | 'recipient'>>;
type BaseNetworkEntry = {
    network: 'base';
} & Omit<Parameters<typeof evmCharge>[0], 'currency' | 'recipient'>;
type CustomNetworkEntry = {
    network: string;
    configure: (address: string) => Method.AnyServer | readonly Method.AnyServer[];
};
type AdditionalNetworkEntry = TempoNetworkEntry | BaseNetworkEntry | CustomNetworkEntry;
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
export declare function stripe(parameters: stripe.Parameters): Promise<Mppx.Mppx<readonly [Method.Server<{
    readonly name: "tempo";
    readonly intent: "charge";
    readonly schema: {
        readonly credential: {
            readonly payload: import("zod/mini").ZodMiniDiscriminatedUnion<[import("zod/mini").ZodMiniObject<{
                hash: import("zod/mini").ZodMiniString<string>;
                type: import("zod/mini").ZodMiniLiteral<"hash">;
            }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniObject<{
                signature: import("zod/mini").ZodMiniString<string>;
                type: import("zod/mini").ZodMiniLiteral<"transaction">;
            }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniObject<{
                signature: import("zod/mini").ZodMiniString<string>;
                type: import("zod/mini").ZodMiniLiteral<"proof">;
            }, import("zod/v4/core").$strip>], "type">;
        };
        readonly request: import("zod/mini").ZodMiniPipe<import("zod/mini").ZodMiniObject<{
            amount: import("zod/mini").ZodMiniString<string>;
            chainId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniNumber<number>>;
            currency: import("zod/mini").ZodMiniString<string>;
            decimals: import("zod/mini").ZodMiniNumber<number>;
            description: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            externalId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            feePayer: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniPipe<import("zod/mini").ZodMiniUnion<readonly [import("zod/mini").ZodMiniBoolean<boolean>, import("zod/mini").ZodMiniCustom<import("viem").Account, import("viem").Account>]>, import("zod/mini").ZodMiniTransform<boolean, boolean | import("viem").Account>>>;
            memo: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            recipient: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            splits: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniArray<import("zod/mini").ZodMiniObject<{
                amount: import("zod/mini").ZodMiniString<string>;
                memo: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
                recipient: import("zod/mini").ZodMiniPipe<import("zod/mini").ZodMiniString<string>, import("zod/mini").ZodMiniTransform<`0x${string}`, string>>;
            }, import("zod/v4/core").$strip>>>;
            supportedModes: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniArray<import("zod/mini").ZodMiniEnum<{
                push: "push";
                pull: "pull";
            }>>>;
        }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniTransform<{
            methodDetails?: {
                supportedModes?: ("push" | "pull")[] | undefined;
                splits?: {
                    amount: string;
                    recipient: `0x${string}`;
                    memo?: string | undefined;
                }[] | undefined;
                memo?: string | undefined;
                feePayer?: boolean | undefined;
                chainId?: number | undefined;
            } | undefined;
            amount: string;
            currency: string;
            description?: string | undefined;
            externalId?: string | undefined;
            recipient?: string | undefined;
        }, {
            amount: string;
            currency: string;
            decimals: number;
            chainId?: number | undefined;
            description?: string | undefined;
            externalId?: string | undefined;
            feePayer?: boolean | undefined;
            memo?: string | undefined;
            recipient?: string | undefined;
            splits?: {
                amount: string;
                recipient: `0x${string}`;
                memo?: string | undefined;
            }[] | undefined;
            supportedModes?: ("push" | "pull")[] | undefined;
        }>>;
    };
}, tempoCharge.DeriveDefaults<{
    readonly testnet?: true | undefined;
    readonly currency: `0x${string}`;
    readonly recipient: `0x${string}`;
}>, undefined, {}, string | undefined>, Method.Server<{
    readonly name: "stripe";
    readonly intent: "charge";
    readonly schema: {
        readonly credential: {
            readonly payload: import("zod/mini").ZodMiniObject<{
                externalId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
                spt: import("zod/mini").ZodMiniString<string>;
            }, import("zod/v4/core").$strip>;
        };
        readonly request: import("zod/mini").ZodMiniPipe<import("zod/mini").ZodMiniObject<{
            amount: import("zod/mini").ZodMiniString<string>;
            currency: import("zod/mini").ZodMiniString<string>;
            decimals: import("zod/mini").ZodMiniNumber<number>;
            description: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            externalId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            metadata: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniRecord<import("zod/mini").ZodMiniString<string>, import("zod/mini").ZodMiniString<string>>>;
            networkId: import("zod/mini").ZodMiniString<string>;
            paymentMethodTypes: import("zod/mini").ZodMiniArray<import("zod/mini").ZodMiniString<string>>;
            recipient: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
        }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniTransform<{
            amount: string;
            methodDetails: {
                metadata?: Record<string, string> | undefined;
                networkId: string;
                paymentMethodTypes: string[];
            };
            currency: string;
            description?: string | undefined;
            externalId?: string | undefined;
            recipient?: string | undefined;
        }, {
            amount: string;
            currency: string;
            decimals: number;
            networkId: string;
            paymentMethodTypes: string[];
            description?: string | undefined;
            externalId?: string | undefined;
            metadata?: Record<string, string> | undefined;
            recipient?: string | undefined;
        }>>;
    };
}, charge_.DeriveDefaults<{
    readonly secretKey: string;
    readonly networkId: string;
    readonly paymentMethodTypes: string[];
}>, undefined, {}, undefined>, ...any[]], import("../../server/Transport.js").Http>>;
export declare namespace stripe {
    type Parameters = {
        /** Stripe secret API key. */
        secretKey: string;
        /** Stripe business network profile ID. */
        profileId: string;
        /** Payment method types for SPT-based payments. @default ['card', 'link'] */
        paymentMethodTypes?: string[] | undefined;
        /**
         * Additional crypto networks to enable beyond the defaults.
         * Entries with the same network name as a built-in override its config.
         */
        additional?: AdditionalNetworkEntry[] | undefined;
        /** MPP secret key for challenge signing. Derived from Stripe key if not provided. */
        mppSecretKey?: string | undefined;
        /** Server realm (e.g. hostname). Auto-detected if not set. */
        realm?: string | undefined;
    };
}
export declare namespace stripe {
    /** Creates a Stripe SPT charge method for card/link payments. */
    const spt: typeof charge_;
    /** @deprecated Use `stripe.spt()` instead. */
    const charge: typeof charge_;
}
export {};
//# sourceMappingURL=Methods.d.ts.map