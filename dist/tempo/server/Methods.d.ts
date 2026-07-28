import { session as sessionLegacy_, settle as settleLegacy_ } from '../legacy/server/index.js';
import { charge as sessionCharge_, session as session_, settle as settle_, settleBatch as settleBatch_ } from '../session/server/Session.js';
import type { SessionController as SessionController_ } from '../session/server/Sse.js';
import * as Ws_ from '../session/server/Ws.js';
import { charge as charge_ } from './Charge.js';
import type * as Relay_ from './Relay.js';
import { renew as renewSubscription_, subscription as subscription_ } from './Subscription.js';
declare function createSessionLegacyMethod<const parameters extends NonNullable<Parameters<typeof sessionLegacy_>[0]>>(parameters?: parameters): never;
/** Creates a legacy contract-backed Tempo `session` server method. */
export declare const sessionLegacy: typeof createSessionLegacyMethod & {
    settle: typeof settleLegacy_;
    Ws: typeof Ws_;
};
/** Settles a legacy contract-backed Tempo session channel. */
export declare const settleLegacy: typeof settleLegacy_;
/**
 * Creates the common Tempo `charge` and `session` methods from shared parameters.
 *
 * When configured, `relay` applies to the `charge` method. Session vouchers
 * remain local state transitions and session relay delegation will be added
 * with its action-specific lifecycle support.
 *
 * @example
 * ```ts
 * import { Mppx, tempo } from 'mppx/server'
 *
 * const mppx = Mppx.create({
 *   methods: [tempo.common({ currency: '0x...', recipient: '0x...' })],
 * })
 * ```
 */
export declare function tempo<const parameters extends tempo.Parameters>(parameters?: parameters): readonly [import("../../Method.js").Server<{
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
}, charge_.DeriveDefaults<parameters>, undefined, {}, string | undefined>, import("../../Method.js").Server<{
    readonly name: "tempo";
    readonly intent: "session";
    readonly schema: {
        readonly credential: {
            readonly payload: import("zod/mini").ZodMiniDiscriminatedUnion<[import("zod/mini").ZodMiniObject<{
                action: import("zod/mini").ZodMiniLiteral<"open">;
                authorizedSigner: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
                channelId: import("zod/mini").ZodMiniString<string>;
                cumulativeAmount: import("zod/mini").ZodMiniString<string>;
                descriptor: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../session/precompile/Protocol.js").ChannelDescriptor, import("../session/precompile/Protocol.js").ChannelDescriptor>>;
                signature: import("zod/mini").ZodMiniString<string>;
                transaction: import("zod/mini").ZodMiniString<string>;
                type: import("zod/mini").ZodMiniLiteral<"transaction">;
            }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniObject<{
                action: import("zod/mini").ZodMiniLiteral<"topUp">;
                additionalDeposit: import("zod/mini").ZodMiniString<string>;
                channelId: import("zod/mini").ZodMiniString<string>;
                descriptor: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../session/precompile/Protocol.js").ChannelDescriptor, import("../session/precompile/Protocol.js").ChannelDescriptor>>;
                transaction: import("zod/mini").ZodMiniString<string>;
                type: import("zod/mini").ZodMiniLiteral<"transaction">;
            }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniObject<{
                action: import("zod/mini").ZodMiniLiteral<"voucher">;
                channelId: import("zod/mini").ZodMiniString<string>;
                cumulativeAmount: import("zod/mini").ZodMiniString<string>;
                descriptor: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../session/precompile/Protocol.js").ChannelDescriptor, import("../session/precompile/Protocol.js").ChannelDescriptor>>;
                signature: import("zod/mini").ZodMiniString<string>;
            }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniObject<{
                action: import("zod/mini").ZodMiniLiteral<"close">;
                channelId: import("zod/mini").ZodMiniString<string>;
                cumulativeAmount: import("zod/mini").ZodMiniString<string>;
                descriptor: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../session/precompile/Protocol.js").ChannelDescriptor, import("../session/precompile/Protocol.js").ChannelDescriptor>>;
                signature: import("zod/mini").ZodMiniString<string>;
            }, import("zod/v4/core").$strip>], "action">;
        };
        readonly request: import("zod/mini").ZodMiniPipe<import("zod/mini").ZodMiniObject<{
            amount: import("zod/mini").ZodMiniString<string>;
            chainId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniNumber<number>>;
            channelId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            currency: import("zod/mini").ZodMiniString<string>;
            decimals: import("zod/mini").ZodMiniNumber<number>;
            escrowContract: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            feePayer: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniPipe<import("zod/mini").ZodMiniUnion<readonly [import("zod/mini").ZodMiniBoolean<boolean>, import("zod/mini").ZodMiniCustom<import("viem").Account, import("viem").Account>]>, import("zod/mini").ZodMiniTransform<boolean, boolean | import("viem").Account>>>;
            minVoucherDelta: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            operator: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            recipient: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            sessionProtocol: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniEnum<{
                v1: "v1";
                v2: "v2";
            }>>;
            sessionSnapshot: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../session/Snapshot.js").SessionSnapshot, import("../session/Snapshot.js").SessionSnapshot>>;
            suggestedDeposit: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
            unitType: import("zod/mini").ZodMiniString<string>;
        }, import("zod/v4/core").$strip>, import("zod/mini").ZodMiniTransform<{
            methodDetails: {
                sessionSnapshot?: import("../session/Snapshot.js").SessionSnapshot | undefined;
                sessionProtocol?: "v1" | "v2" | undefined;
                operator?: string | undefined;
                feePayer?: boolean | undefined;
                chainId?: number | undefined;
                minVoucherDelta?: string | undefined;
                channelId?: string | undefined;
                escrowContract: string | undefined;
            };
            suggestedDeposit?: string | undefined;
            amount: string;
            currency: string;
            unitType: string;
            recipient?: string | undefined;
        }, {
            amount: string;
            currency: string;
            decimals: number;
            unitType: string;
            chainId?: number | undefined;
            channelId?: string | undefined;
            escrowContract?: string | undefined;
            feePayer?: boolean | undefined;
            minVoucherDelta?: string | undefined;
            operator?: string | undefined;
            recipient?: string | undefined;
            sessionProtocol?: "v1" | "v2" | undefined;
            sessionSnapshot?: import("../session/Snapshot.js").SessionSnapshot | undefined;
            suggestedDeposit?: string | undefined;
        }>>;
    };
}, session_.DeriveDefaults<parameters>, parameters["sse"] extends false | undefined ? undefined : import("./internal/transport.js").Sse, {}, undefined>];
export declare namespace tempo {
    type Parameters = charge_.Parameters & session_.Parameters;
    /** Tempo API relay configuration for server-side charges. */
    type RelayOptions = charge_.RelayOptions;
    /** Stable failure codes returned by Tempo API's MPP relay. */
    type RelayErrorCode = Relay_.configure.ErrorCode;
    /** Safe relay failure details exposed by the Tempo API relay. */
    type RelayErrorDetails = Relay_.configure.ErrorDetails;
    /** Creates a Tempo `charge` method for one-time TIP-20 token transfers. */
    const charge: typeof charge_;
    /** Creates the common Tempo `charge` and `session` methods from shared parameters. */
    const common: typeof tempo;
    /** Creates a TIP-1034 Tempo `session` method for session-based TIP-20 token payments. */
    const session: typeof session_ & {
        charge: typeof sessionCharge_;
        settle: typeof settle_;
        settleBatch: typeof settleBatch_;
    };
    /** @deprecated Use `tempo.session()` for the TIP-1034 session server method. */
    const sessionLegacy: typeof createSessionLegacyMethod & {
        settle: typeof settleLegacy_;
        Ws: typeof Ws_;
    };
    /** Creates a Tempo `subscription` method for recurring TIP-20 token payments. */
    const subscription: typeof subscription_;
    /** Renews an overdue Tempo subscription outside of the HTTP request path. */
    const renewSubscription: typeof renewSubscription_;
    /** One-shot settle: reads highest voucher from storage and submits on-chain. */
    const settle: typeof settle_;
    /** Batch-settle precompile-backed session channels. */
    const settleBatch: typeof settleBatch_;
    /** Types for Tempo session streams. */
    namespace Sse {
        /** Controller passed to manual-charge SSE generators. */
        type SessionController = SessionController_;
    }
    /** Experimental websocket helpers for Tempo sessions. */
    const Ws: typeof Ws_;
}
export {};
//# sourceMappingURL=Methods.d.ts.map