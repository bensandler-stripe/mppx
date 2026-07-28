import type { Account } from 'viem';
import * as z from '../zod.js';
import type { SessionSnapshot } from './session/client/Runtime.js';
import type * as PrecompileChannel from './session/precompile/Channel.js';
export declare const chargeModes: readonly ["push", "pull"];
export type ChargeMode = (typeof chargeModes)[number];
export type SubscriptionPeriodCountInput = string | number | bigint;
declare const subscriptionAccessKey: z.ZodMiniObject<{
    accessKeyAddress: z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<`0x${string}`, string>>;
    keyType: z.ZodMiniEnum<{
        secp256k1: "secp256k1";
        p256: "p256";
        webAuthn: "webAuthn";
    }>;
}, z.core.$strip>;
/**
 * Tempo charge intent for one-time TIP-20 token transfers.
 *
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/methods/tempo/draft-tempo-charge-00.md
 */
export declare const charge: {
    readonly name: "tempo";
    readonly intent: "charge";
    readonly schema: {
        readonly credential: {
            readonly payload: z.ZodMiniDiscriminatedUnion<[z.ZodMiniObject<{
                hash: z.ZodMiniString<string>;
                type: z.ZodMiniLiteral<"hash">;
            }, z.core.$strip>, z.ZodMiniObject<{
                signature: z.ZodMiniString<string>;
                type: z.ZodMiniLiteral<"transaction">;
            }, z.core.$strip>, z.ZodMiniObject<{
                signature: z.ZodMiniString<string>;
                type: z.ZodMiniLiteral<"proof">;
            }, z.core.$strip>], "type">;
        };
        readonly request: z.ZodMiniPipe<z.ZodMiniObject<{
            amount: z.ZodMiniString<string>;
            chainId: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
            currency: z.ZodMiniString<string>;
            decimals: z.ZodMiniNumber<number>;
            description: z.ZodMiniOptional<z.ZodMiniString<string>>;
            externalId: z.ZodMiniOptional<z.ZodMiniString<string>>;
            feePayer: z.ZodMiniOptional<z.ZodMiniPipe<z.ZodMiniUnion<readonly [z.ZodMiniBoolean<boolean>, z.ZodMiniCustom<Account, Account>]>, z.ZodMiniTransform<boolean, boolean | Account>>>;
            memo: z.ZodMiniOptional<z.ZodMiniString<string>>;
            recipient: z.ZodMiniOptional<z.ZodMiniString<string>>;
            splits: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniObject<{
                amount: z.ZodMiniString<string>;
                memo: z.ZodMiniOptional<z.ZodMiniString<string>>;
                recipient: z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<`0x${string}`, string>>;
            }, z.core.$strip>>>;
            supportedModes: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniEnum<{
                push: "push";
                pull: "pull";
            }>>>;
        }, z.core.$strip>, z.ZodMiniTransform<{
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
};
/**
 * Tempo session intent for pay-as-you-go streaming payments.
 *
 * Uses cumulative vouchers over a payment channel. Credential payloads
 * are a discriminated union on `action`: open, topUp, voucher, close.
 */
export declare const session: {
    readonly name: "tempo";
    readonly intent: "session";
    readonly schema: {
        readonly credential: {
            readonly payload: z.ZodMiniDiscriminatedUnion<[z.ZodMiniObject<{
                action: z.ZodMiniLiteral<"open">;
                authorizedSigner: z.ZodMiniOptional<z.ZodMiniString<string>>;
                channelId: z.ZodMiniString<string>;
                cumulativeAmount: z.ZodMiniString<string>;
                descriptor: z.ZodMiniOptional<z.ZodMiniCustom<PrecompileChannel.ChannelDescriptor, PrecompileChannel.ChannelDescriptor>>;
                signature: z.ZodMiniString<string>;
                transaction: z.ZodMiniString<string>;
                type: z.ZodMiniLiteral<"transaction">;
            }, z.core.$strip>, z.ZodMiniObject<{
                action: z.ZodMiniLiteral<"topUp">;
                additionalDeposit: z.ZodMiniString<string>;
                channelId: z.ZodMiniString<string>;
                descriptor: z.ZodMiniOptional<z.ZodMiniCustom<PrecompileChannel.ChannelDescriptor, PrecompileChannel.ChannelDescriptor>>;
                transaction: z.ZodMiniString<string>;
                type: z.ZodMiniLiteral<"transaction">;
            }, z.core.$strip>, z.ZodMiniObject<{
                action: z.ZodMiniLiteral<"voucher">;
                channelId: z.ZodMiniString<string>;
                cumulativeAmount: z.ZodMiniString<string>;
                descriptor: z.ZodMiniOptional<z.ZodMiniCustom<PrecompileChannel.ChannelDescriptor, PrecompileChannel.ChannelDescriptor>>;
                signature: z.ZodMiniString<string>;
            }, z.core.$strip>, z.ZodMiniObject<{
                action: z.ZodMiniLiteral<"close">;
                channelId: z.ZodMiniString<string>;
                cumulativeAmount: z.ZodMiniString<string>;
                descriptor: z.ZodMiniOptional<z.ZodMiniCustom<PrecompileChannel.ChannelDescriptor, PrecompileChannel.ChannelDescriptor>>;
                signature: z.ZodMiniString<string>;
            }, z.core.$strip>], "action">;
        };
        readonly request: z.ZodMiniPipe<z.ZodMiniObject<{
            amount: z.ZodMiniString<string>;
            chainId: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
            channelId: z.ZodMiniOptional<z.ZodMiniString<string>>;
            currency: z.ZodMiniString<string>;
            decimals: z.ZodMiniNumber<number>;
            escrowContract: z.ZodMiniOptional<z.ZodMiniString<string>>;
            feePayer: z.ZodMiniOptional<z.ZodMiniPipe<z.ZodMiniUnion<readonly [z.ZodMiniBoolean<boolean>, z.ZodMiniCustom<Account, Account>]>, z.ZodMiniTransform<boolean, boolean | Account>>>;
            minVoucherDelta: z.ZodMiniOptional<z.ZodMiniString<string>>;
            operator: z.ZodMiniOptional<z.ZodMiniString<string>>;
            recipient: z.ZodMiniOptional<z.ZodMiniString<string>>;
            sessionProtocol: z.ZodMiniOptional<z.ZodMiniEnum<{
                v1: "v1";
                v2: "v2";
            }>>;
            sessionSnapshot: z.ZodMiniOptional<z.ZodMiniCustom<SessionSnapshot, SessionSnapshot>>;
            suggestedDeposit: z.ZodMiniOptional<z.ZodMiniString<string>>;
            unitType: z.ZodMiniString<string>;
        }, z.core.$strip>, z.ZodMiniTransform<{
            methodDetails: {
                sessionSnapshot?: SessionSnapshot | undefined;
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
            sessionSnapshot?: SessionSnapshot | undefined;
            suggestedDeposit?: string | undefined;
        }>>;
    };
};
/**
 * Tempo subscription intent for recurring TIP-20 token transfers.
 *
 * Uses a signed key authorization that delegates one transfer per billing period.
 */
export declare const subscription: {
    readonly name: "tempo";
    readonly intent: "subscription";
    readonly schema: {
        readonly credential: {
            readonly payload: z.ZodMiniObject<{
                signature: z.ZodMiniString<string>;
                type: z.ZodMiniLiteral<"keyAuthorization">;
            }, z.core.$strip>;
        };
        readonly request: z.ZodMiniPipe<z.ZodMiniObject<{
            amount: z.ZodMiniString<string>;
            accessKey: z.ZodMiniOptional<z.ZodMiniObject<{
                accessKeyAddress: z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<`0x${string}`, string>>;
                keyType: z.ZodMiniEnum<{
                    secp256k1: "secp256k1";
                    p256: "p256";
                    webAuthn: "webAuthn";
                }>;
            }, z.core.$strip>>;
            chainId: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
            currency: z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<`0x${string}`, string>>;
            decimals: z.ZodMiniNumber<number>;
            description: z.ZodMiniOptional<z.ZodMiniString<string>>;
            externalId: z.ZodMiniOptional<z.ZodMiniString<string>>;
            methodDetails: z.ZodMiniOptional<z.ZodMiniObject<{
                accessKey: z.ZodMiniOptional<z.ZodMiniObject<{
                    accessKeyAddress: z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<`0x${string}`, string>>;
                    keyType: z.ZodMiniEnum<{
                        secp256k1: "secp256k1";
                        p256: "p256";
                        webAuthn: "webAuthn";
                    }>;
                }, z.core.$strip>>;
                chainId: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
            }, z.core.$strip>>;
            periodCount: z.ZodMiniPipe<z.ZodMiniUnion<readonly [z.ZodMiniString<string>, z.ZodMiniBigInt<bigint>, z.ZodMiniCustom<number, number>]>, z.ZodMiniTransform<string, string | number | bigint>>;
            periodUnit: z.ZodMiniEnum<{
                dev_second: "dev_second";
                day: "day";
                week: "week";
            }>;
            recipient: z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<`0x${string}`, string>>;
            subscriptionExpires: z.ZodMiniPipe<z.ZodMiniUnion<readonly [z.ZodMiniString<string>, z.ZodMiniCustom<Date, Date>]>, z.ZodMiniTransform<Date, z.DatetimeInput>>;
        }, z.core.$strip>, z.ZodMiniTransform<{
            methodDetails?: {
                accessKey?: z.infer<typeof subscriptionAccessKey> | undefined;
                chainId?: number | undefined;
            } | undefined;
            amount: string;
            subscriptionExpires: string;
            currency: `0x${string}`;
            periodCount: string;
            periodUnit: "dev_second" | "day" | "week";
            recipient: `0x${string}`;
            description?: string | undefined;
            externalId?: string | undefined;
        }, {
            amount: string;
            currency: `0x${string}`;
            decimals: number;
            periodCount: string;
            periodUnit: "dev_second" | "day" | "week";
            recipient: `0x${string}`;
            subscriptionExpires: Date;
            accessKey?: {
                accessKeyAddress: `0x${string}`;
                keyType: "secp256k1" | "p256" | "webAuthn";
            } | undefined;
            chainId?: number | undefined;
            description?: string | undefined;
            externalId?: string | undefined;
            methodDetails?: {
                accessKey?: {
                    accessKeyAddress: `0x${string}`;
                    keyType: "secp256k1" | "p256" | "webAuthn";
                } | undefined;
                chainId?: number | undefined;
            } | undefined;
        }>>;
    };
};
export {};
//# sourceMappingURL=Methods.d.ts.map