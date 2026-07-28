import { session as sessionLegacyIntent_, sessionManager as sessionLegacy_ } from '../legacy/client/index.js';
import { session as sessionMethod_ } from '../session/client/Session.js';
import { sessionManager as session_ } from '../session/client/SessionManager.js';
import { charge as charge_ } from './Charge.js';
import { subscription as subscription_ } from './Subscription.js';
declare const sessionClient: typeof sessionMethod_ & {
    manager: typeof session_;
};
/** Creates a TIP-1034 client method, with explicit managed lifecycle helpers attached. */
export { sessionClient as session };
/**
 * Creates the common Tempo `charge` and `session` client methods from shared parameters.
 *
 * @example
 * ```ts
 * import { Mppx, tempo } from 'mppx/client'
 *
 * const mppx = Mppx.create({
 *   methods: [tempo.common({ account })],
 * })
 * ```
 */
export declare function tempo(parameters?: tempo.Parameters): readonly [import("../../Method.js").Client<{
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
}, import("zod/mini").ZodMiniObject<{
    account: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<`0x${string}` | import("../../viem/Account.js").Account | undefined, `0x${string}` | import("../../viem/Account.js").Account | undefined>>;
    autoSwap: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../internal/auto-swap.js").resolve.Value | undefined, import("../internal/auto-swap.js").resolve.Value | undefined>>;
    mode: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniEnum<{
        push: "push";
        pull: "pull";
    }>>;
}, import("zod/v4/core").$strip>>, import("../../Method.js").Client<{
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
}, import("zod/mini").ZodMiniObject<{
    account: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<`0x${string}` | import("../../viem/Account.js").Account | undefined, `0x${string}` | import("../../viem/Account.js").Account | undefined>>;
    autoSwap: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../internal/auto-swap.js").resolve.Value, import("../internal/auto-swap.js").resolve.Value>>;
    action: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniEnum<{
        open: "open";
        topUp: "topUp";
        voucher: "voucher";
        close: "close";
    }>>;
    channelId: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<`0x${string}`, `0x${string}`>>;
    cumulativeAmount: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
    cumulativeAmountRaw: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
    transaction: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<`0x${string}`, `0x${string}`>>;
    descriptor: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniCustom<import("../session/precompile/Protocol.js").ChannelDescriptor, import("../session/precompile/Protocol.js").ChannelDescriptor>>;
    additionalDeposit: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
    additionalDepositRaw: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
    depositRaw: import("zod/mini").ZodMiniOptional<import("zod/mini").ZodMiniString<string>>;
}, import("zod/v4/core").$strip>>];
export declare namespace tempo {
    type Parameters = charge_.Parameters & sessionMethod_.Parameters;
    /** Creates a Tempo `charge` client method for one-time TIP-20 token transfers. */
    const charge: typeof charge_;
    /** Creates the common Tempo `charge` and `session` client methods from shared parameters. */
    const common: typeof tempo;
    /** Creates a TIP-1034 client method for Mppx registration. Use `tempo.session.manager()` for direct lifecycle control. */
    const session: typeof sessionMethod_ & {
        manager: typeof session_;
    };
    /** @deprecated Use `tempo.session()` for the TIP-1034 session client method. */
    const sessionLegacy: typeof sessionLegacy_ & {
        method: typeof sessionLegacyIntent_;
    };
    /** Creates a Tempo `subscription` client method for recurring TIP-20 payments. */
    const subscription: typeof subscription_;
}
//# sourceMappingURL=Methods.d.ts.map