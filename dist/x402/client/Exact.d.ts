import type { Account } from 'viem';
import type * as Challenge from '../../Challenge.js';
import * as Assets from '../Assets.js';
import * as Types from '../Types.js';
/**
 * Creates an x402 exact `PAYMENT-SIGNATURE` credential.
 */
export declare function createCredential(parameters: createCredential.Parameters): Promise<string>;
export declare namespace createCredential {
    type Parameters = {
        challenge: Challenge.Challenge<Types.ExactRequest>;
        config: Config;
        context?: Context | undefined;
    };
}
export type Context = {
    account?: Account | undefined;
};
export type Signer = Account & {
    signTypedData?: (parameters: any) => Promise<`0x${string}`>;
};
export type Config = {
    /** Account used to sign exact EVM payment payloads. */
    account: Account;
    /** Optional token decimals used to parse `maxAmount` when currency metadata is not provided. */
    decimals?: number | undefined;
    /** Optional maximum display-unit amount the client is willing to pay. */
    maxAmount?: string | undefined;
    /** Optional maximum atomic amount the client is willing to pay. */
    maxAtomicAmount?: string | undefined;
    /** Optional allowlist of supported EVM chain IDs. */
    networks?: readonly number[] | undefined;
    /** Optional allowlist of supported currencies. */
    currencies?: readonly Assets.Currency[] | undefined;
    /** Legacy alias for `currencies`. */
    assets?: readonly Assets.Currency[] | undefined;
};
//# sourceMappingURL=Exact.d.ts.map