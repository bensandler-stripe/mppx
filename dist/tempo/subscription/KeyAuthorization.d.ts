import { KeyAuthorization, SignatureEnvelope } from 'ox/tempo';
import { type Address } from 'viem';
import type * as Methods from '../Methods.js';
import type { SubscriptionAccessKey, SubscriptionCredentialPayload, SubscriptionPeriodUnit } from './Types.js';
/** 4-byte selector for TIP-20 `transfer(address,uint256)`. */
export declare const transferSelector = "0xa9059cbb";
/** 4-byte selector for TIP-20 `transferWithMemo(address,uint256,bytes32)`. */
export declare const transferWithMemoSelector = "0x95777d59";
type SubscriptionRequest = ReturnType<typeof Methods.subscription.schema.request.parse>;
/**
 * Converts a subscription expiry timestamp into the Unix seconds value required by Tempo key
 * authorizations.
 */
export declare function toSubscriptionExpiryDate(subscriptionExpires: string | Date): Date;
export declare function toSubscriptionExpirySeconds(subscriptionExpires: Date): number;
/**
 * Converts the shared subscription period fields into the numeric period accepted by Tempo key
 * authorizations.
 */
export declare function toSubscriptionPeriodSeconds(request: {
    periodCount: string;
    periodUnit: SubscriptionPeriodUnit;
}): number;
/**
 * Verifies that the subscription duration is representable and lasts beyond the payment challenge.
 */
export declare function assertSubscriptionTiming(parameters: {
    challengeExpires?: string | undefined;
    request: Pick<SubscriptionRequest, 'periodCount' | 'periodUnit' | 'subscriptionExpires'>;
}): void;
/** Builds the Tempo access-key call scopes required for a subscription payment. */
export declare function getSubscriptionScopes(request: Pick<SubscriptionRequest, 'currency' | 'recipient'>): readonly [{
    readonly address: `0x${string}`;
    readonly selector: "0x95777d59";
    readonly recipients: readonly [`0x${string}`];
}];
/** Builds the RPC `allowedCalls` payload passed to `wallet_authorizeAccessKey`. */
export declare function getSubscriptionRpcAllowedCalls(request: Pick<SubscriptionRequest, 'currency' | 'recipient'>): readonly [{
    readonly target: `0x${string}`;
    readonly selectorRules: readonly [{
        readonly selector: "0x95777d59";
        readonly recipients: readonly [`0x${string}`];
    }];
}];
/**
 * Creates and signs a Tempo key authorization for subscription payments when the account can sign
 * arbitrary hashes locally.
 */
export declare function signSubscriptionKeyAuthorization(parameters: {
    accessKey: SubscriptionAccessKey;
    account: {
        sign?: ((parameters: {
            hash: `0x${string}`;
        }) => Promise<`0x${string}`>) | undefined;
    };
    chainId: number;
    request: Pick<SubscriptionRequest, 'amount' | 'currency' | 'periodCount' | 'periodUnit' | 'recipient' | 'subscriptionExpires'>;
}): Promise<{
    readonly address: `0x${string}`;
    readonly chainId: bigint;
    readonly expiry: number;
    readonly limits: readonly {
        readonly token: `0x${string}`;
        readonly limit: bigint;
        readonly period: number;
    }[];
    readonly scopes: readonly {
        readonly address: `0x${string}`;
        readonly selector: "0x95777d59";
        readonly recipients: readonly `0x${string}`[];
    }[];
    readonly type: "secp256k1" | "p256" | "webAuthn";
    signature: {
        signature: {
            r: bigint;
            s: bigint;
            yParity: number;
        };
        type: "secp256k1";
        version?: undefined;
        init?: undefined;
        account?: undefined;
        prehash?: undefined;
        publicKey?: undefined;
        metadata?: undefined;
        userAddress?: undefined;
        inner?: undefined;
        keyId?: undefined;
        genesisConfigId?: undefined;
        signatures?: undefined;
    } | {
        prehash: boolean;
        publicKey: {
            prefix: number;
            x: bigint;
            y: bigint;
        };
        signature: {
            r: bigint;
            s: bigint;
            yParity?: number | undefined;
        };
        type: "p256";
        version?: undefined;
        init?: undefined;
        account?: undefined;
        metadata?: undefined;
        userAddress?: undefined;
        inner?: undefined;
        keyId?: undefined;
        genesisConfigId?: undefined;
        signatures?: undefined;
    } | {
        metadata: {
            authenticatorData: import("ox/Hex").Hex;
            clientDataJSON: string;
        };
        signature: {
            r: bigint;
            s: bigint;
            yParity?: number | undefined;
        };
        publicKey: {
            prefix: number;
            x: bigint;
            y: bigint;
        };
        type: "webAuthn";
        version?: undefined;
        init?: undefined;
        account?: undefined;
        prehash?: undefined;
        userAddress?: undefined;
        inner?: undefined;
        keyId?: undefined;
        genesisConfigId?: undefined;
        signatures?: undefined;
    } | {
        userAddress: import("ox/Address").Address;
        inner: {
            signature: {
                r: bigint;
                s: bigint;
                yParity: number;
            };
            type: "secp256k1";
            version?: undefined;
            init?: undefined;
            account?: undefined;
            prehash?: undefined;
            publicKey?: undefined;
            metadata?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            prehash: boolean;
            publicKey: {
                prefix: number;
                x: bigint;
                y: bigint;
            };
            signature: {
                r: bigint;
                s: bigint;
                yParity?: number | undefined;
            };
            type: "p256";
            version?: undefined;
            init?: undefined;
            account?: undefined;
            metadata?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            metadata: {
                authenticatorData: import("ox/Hex").Hex;
                clientDataJSON: string;
            };
            signature: {
                r: bigint;
                s: bigint;
                yParity?: number | undefined;
            };
            publicKey: {
                prefix: number;
                x: bigint;
                y: bigint;
            };
            type: "webAuthn";
            version?: undefined;
            init?: undefined;
            account?: undefined;
            prehash?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            userAddress: import("ox/Address").Address;
            inner: {
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity: number;
                };
                type: "secp256k1";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                prehash: boolean;
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                type: "p256";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                metadata: {
                    authenticatorData: import("ox/Hex").Hex;
                    clientDataJSON: string;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                type: "webAuthn";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | /*elided*/ any | {
                type: "multisig";
                account: import("ox/Address").Address;
                genesisConfigId: import("ox/Hex").Hex;
                signatures: readonly ({
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity: number;
                    };
                    type: "secp256k1";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    publicKey?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    prehash: boolean;
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    type: "p256";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    metadata: {
                        authenticatorData: import("ox/Hex").Hex;
                        clientDataJSON: string;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    type: "webAuthn";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | /*elided*/ any | /*elided*/ any)[];
                init?: {
                    salt?: `0x${string}` | undefined;
                    threshold: number;
                    owners: readonly {
                        owner: import("ox/Address").Address;
                        weight: number;
                    }[];
                } | undefined;
                version?: undefined;
                signature?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
            };
            keyId?: `0x${string}` | undefined;
            type: "keychain";
            version?: SignatureEnvelope.KeychainVersion | undefined;
            signature?: undefined;
            init?: undefined;
            account?: undefined;
            prehash?: undefined;
            publicKey?: undefined;
            metadata?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            type: "multisig";
            account: import("ox/Address").Address;
            genesisConfigId: import("ox/Hex").Hex;
            signatures: readonly ({
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity: number;
                };
                type: "secp256k1";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                prehash: boolean;
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                type: "p256";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                metadata: {
                    authenticatorData: import("ox/Hex").Hex;
                    clientDataJSON: string;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                type: "webAuthn";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                userAddress: import("ox/Address").Address;
                inner: {
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity: number;
                    };
                    type: "secp256k1";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    publicKey?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    prehash: boolean;
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    type: "p256";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    metadata: {
                        authenticatorData: import("ox/Hex").Hex;
                        clientDataJSON: string;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    type: "webAuthn";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | /*elided*/ any | /*elided*/ any;
                keyId?: `0x${string}` | undefined;
                type: "keychain";
                version?: SignatureEnvelope.KeychainVersion | undefined;
                signature?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | /*elided*/ any)[];
            init?: {
                salt?: `0x${string}` | undefined;
                threshold: number;
                owners: readonly {
                    owner: import("ox/Address").Address;
                    weight: number;
                }[];
            } | undefined;
            version?: undefined;
            signature?: undefined;
            prehash?: undefined;
            publicKey?: undefined;
            metadata?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
        };
        keyId?: `0x${string}` | undefined;
        type: "keychain";
        version?: SignatureEnvelope.KeychainVersion | undefined;
        signature?: undefined;
        init?: undefined;
        account?: undefined;
        prehash?: undefined;
        publicKey?: undefined;
        metadata?: undefined;
        genesisConfigId?: undefined;
        signatures?: undefined;
    } | {
        type: "multisig";
        account: import("ox/Address").Address;
        genesisConfigId: import("ox/Hex").Hex;
        signatures: readonly ({
            signature: {
                r: bigint;
                s: bigint;
                yParity: number;
            };
            type: "secp256k1";
            version?: undefined;
            init?: undefined;
            account?: undefined;
            prehash?: undefined;
            publicKey?: undefined;
            metadata?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            prehash: boolean;
            publicKey: {
                prefix: number;
                x: bigint;
                y: bigint;
            };
            signature: {
                r: bigint;
                s: bigint;
                yParity?: number | undefined;
            };
            type: "p256";
            version?: undefined;
            init?: undefined;
            account?: undefined;
            metadata?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            metadata: {
                authenticatorData: import("ox/Hex").Hex;
                clientDataJSON: string;
            };
            signature: {
                r: bigint;
                s: bigint;
                yParity?: number | undefined;
            };
            publicKey: {
                prefix: number;
                x: bigint;
                y: bigint;
            };
            type: "webAuthn";
            version?: undefined;
            init?: undefined;
            account?: undefined;
            prehash?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            userAddress: import("ox/Address").Address;
            inner: {
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity: number;
                };
                type: "secp256k1";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                prehash: boolean;
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                type: "p256";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                metadata: {
                    authenticatorData: import("ox/Hex").Hex;
                    clientDataJSON: string;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                type: "webAuthn";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | /*elided*/ any | {
                type: "multisig";
                account: import("ox/Address").Address;
                genesisConfigId: import("ox/Hex").Hex;
                signatures: readonly ({
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity: number;
                    };
                    type: "secp256k1";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    publicKey?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    prehash: boolean;
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    type: "p256";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    metadata: {
                        authenticatorData: import("ox/Hex").Hex;
                        clientDataJSON: string;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    type: "webAuthn";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | /*elided*/ any | /*elided*/ any)[];
                init?: {
                    salt?: `0x${string}` | undefined;
                    threshold: number;
                    owners: readonly {
                        owner: import("ox/Address").Address;
                        weight: number;
                    }[];
                } | undefined;
                version?: undefined;
                signature?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
            };
            keyId?: `0x${string}` | undefined;
            type: "keychain";
            version?: SignatureEnvelope.KeychainVersion | undefined;
            signature?: undefined;
            init?: undefined;
            account?: undefined;
            prehash?: undefined;
            publicKey?: undefined;
            metadata?: undefined;
            genesisConfigId?: undefined;
            signatures?: undefined;
        } | {
            type: "multisig";
            account: import("ox/Address").Address;
            genesisConfigId: import("ox/Hex").Hex;
            signatures: readonly ({
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity: number;
                };
                type: "secp256k1";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                prehash: boolean;
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                type: "p256";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                metadata?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                metadata: {
                    authenticatorData: import("ox/Hex").Hex;
                    clientDataJSON: string;
                };
                signature: {
                    r: bigint;
                    s: bigint;
                    yParity?: number | undefined;
                };
                publicKey: {
                    prefix: number;
                    x: bigint;
                    y: bigint;
                };
                type: "webAuthn";
                version?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                userAddress?: undefined;
                inner?: undefined;
                keyId?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | {
                userAddress: import("ox/Address").Address;
                inner: {
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity: number;
                    };
                    type: "secp256k1";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    publicKey?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    prehash: boolean;
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    type: "p256";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    metadata?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | {
                    metadata: {
                        authenticatorData: import("ox/Hex").Hex;
                        clientDataJSON: string;
                    };
                    signature: {
                        r: bigint;
                        s: bigint;
                        yParity?: number | undefined;
                    };
                    publicKey: {
                        prefix: number;
                        x: bigint;
                        y: bigint;
                    };
                    type: "webAuthn";
                    version?: undefined;
                    init?: undefined;
                    account?: undefined;
                    prehash?: undefined;
                    userAddress?: undefined;
                    inner?: undefined;
                    keyId?: undefined;
                    genesisConfigId?: undefined;
                    signatures?: undefined;
                } | /*elided*/ any | /*elided*/ any;
                keyId?: `0x${string}` | undefined;
                type: "keychain";
                version?: SignatureEnvelope.KeychainVersion | undefined;
                signature?: undefined;
                init?: undefined;
                account?: undefined;
                prehash?: undefined;
                publicKey?: undefined;
                metadata?: undefined;
                genesisConfigId?: undefined;
                signatures?: undefined;
            } | /*elided*/ any)[];
            init?: {
                salt?: `0x${string}` | undefined;
                threshold: number;
                owners: readonly {
                    owner: import("ox/Address").Address;
                    weight: number;
                }[];
            } | undefined;
            version?: undefined;
            signature?: undefined;
            prehash?: undefined;
            publicKey?: undefined;
            metadata?: undefined;
            userAddress?: undefined;
            inner?: undefined;
            keyId?: undefined;
        })[];
        init?: {
            salt?: `0x${string}` | undefined;
            threshold: number;
            owners: readonly {
                owner: import("ox/Address").Address;
                weight: number;
            }[];
        } | undefined;
        version?: undefined;
        signature?: undefined;
        prehash?: undefined;
        publicKey?: undefined;
        metadata?: undefined;
        userAddress?: undefined;
        inner?: undefined;
        keyId?: undefined;
    };
} | undefined>;
/**
 * Verifies that a subscription credential contains a key authorization scoped to the requested
 * token, recipient, amount, period, expiry, chain, and server-issued access key.
 */
export declare function verifySubscriptionKeyAuthorization(parameters: {
    accessKey?: SubscriptionAccessKey | undefined;
    chainId: number;
    payload: SubscriptionCredentialPayload;
    request: SubscriptionRequest;
}): {
    authorization: KeyAuthorization.KeyAuthorization<boolean, bigint, number, `0x${string}`>;
    source: {
        address: Address;
        chainId: number;
    };
};
export {};
//# sourceMappingURL=KeyAuthorization.d.ts.map