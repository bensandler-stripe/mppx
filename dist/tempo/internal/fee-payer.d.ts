import type { TempoAddress } from 'ox/tempo';
import type { Hex } from 'viem';
import type { Account } from 'viem';
import { Transaction } from 'viem/tempo';
/** Returns true if the serialized transaction has a Tempo envelope prefix. */
export declare function isTempoTransaction(serialized: string | undefined): boolean;
/**
 * Allowed call patterns for fee-payer sponsored transactions.
 * Each inner array is an ordered list of function selectors.
 */
export declare const callScopes: `0x${string}`[][];
export type Policy = {
    maxGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    maxTotalFee: bigint;
    maxValidityWindowSeconds: number;
};
type SponsoredTransaction = ReturnType<(typeof Transaction)['deserialize']>;
type ExpectedTransfer = {
    amount: string;
    allowAnyMemo?: boolean | undefined;
    memo?: Hex | undefined;
    recipient: TempoAddress.Address;
};
/** Returns fee tokens that mppx allows sponsored transactions to charge. */
export declare function defaultAllowedFeeTokens(chainId: number | undefined): TempoAddress.Address[];
/** Rejects a sponsored fee token outside the server's allowlist. */
export declare function assertAllowedFeeToken(transaction: {
    feeToken?: unknown;
}, allowedFeeTokens: readonly TempoAddress.Address[]): void;
/**
 * Co-signs a sender-signed partial sponsorship envelope using a hosted
 * fee-payer endpoint without letting the endpoint mutate sender-committed
 * transaction fields.
 *
 * @returns The serialized co-signed transaction plus the sponsor's recovered
 *   `feePayer` address and chosen `feeToken`, so callers can pre-broadcast
 *   simulate the exact transaction the sponsor broadcasts.
 */
export declare function fillHostedFeePayerTransaction(parameters: {
    allowedFeeTokens: readonly TempoAddress.Address[];
    challengeExpires?: string | undefined;
    chainId: number;
    details: Record<string, string>;
    policy?: Partial<Policy> | undefined;
    transaction: SponsoredTransaction;
    url: string;
}): Promise<{
    feePayer: `0x${string}`;
    feeToken: TempoAddress.Address;
    serializedTransaction: `0x${string}`;
}>;
/**
 * Returns a transaction shape suitable for pre-broadcast simulation.
 *
 * Sponsored transactions are first simulated as calls from the sender with no
 * fee fields or signatures. This checks call execution without requiring the
 * sender to hold the fee token; transferred value and call-level balances are
 * still checked by the RPC.
 */
export declare function simulationTransaction(transaction: SponsoredTransaction, options: {
    feePayer: boolean;
}): any;
/**
 * Returns the final fee-sponsored transaction shape for pre-broadcast
 * simulation. RPC `eth_call` does not carry either transaction signature.
 */
export declare function sponsoredSimulationTransaction(transaction: SponsoredTransaction, options: {
    feePayer: TempoAddress.Address;
    feeToken?: TempoAddress.Address | undefined;
}): any;
/** A completed sponsorship envelope that can be simulated before signing or broadcast. */
export type PreflightSponsorship = {
    feePayer: TempoAddress.Address;
    feeToken?: TempoAddress.Address | undefined;
    transaction: SponsoredTransaction;
};
/**
 * Runs execution-only sender and final-envelope simulations around sponsorship.
 *
 * First, it simulates the calls with the sender as `from`, omitting fee fields
 * and signatures so the sender's fee balance is irrelevant. Next, `complete`
 * resolves the sponsor and produces the co-signed transaction. Finally, it
 * simulates that transaction with its concrete fee payer and fee token.
 *
 * `complete` runs only after sender-context execution succeeds, so a reverting
 * transaction never reaches a local signer or hosted fee-payer.
 */
export declare function preflightSponsorship<sponsorship extends PreflightSponsorship>(parameters: {
    complete: () => Promise<sponsorship>;
    simulate: (request: Record<string, unknown>) => Promise<unknown>;
    transaction: SponsoredTransaction;
}): Promise<sponsorship>;
/** Validates that a set of transaction calls matches an allowed fee-payer pattern. */
export declare function validateCalls(calls: readonly {
    data?: `0x${string}` | undefined;
    to?: TempoAddress.Address | undefined;
}[], details: Record<string, string>, options?: {
    currency?: TempoAddress.Address | undefined;
    expectedTransfers?: readonly ExpectedTransfer[] | undefined;
}): void;
/** Validates sponsor fee policy limits for a fee-payer transaction. */
export declare function assertTransactionPolicy(parameters: {
    challengeExpires?: string | undefined;
    chainId: number;
    details: Record<string, string>;
    now?: Date | undefined;
    policy?: Partial<Policy> | undefined;
    transaction: SponsoredTransaction;
}): {
    gasLimit: any;
    maxFeePerGasValue: any;
    totalFee: bigint;
    validBeforeValue: any;
};
export declare function prepareSponsoredTransaction(parameters: {
    account: Account;
    allowedFeeTokens?: readonly TempoAddress.Address[] | undefined;
    challengeExpires?: string | undefined;
    chainId: number;
    details: Record<string, string>;
    now?: Date | undefined;
    policy?: Partial<Policy> | undefined;
    transaction: SponsoredTransaction;
}): {
    validBefore: any;
    validAfter?: any;
    type: "tempo";
    signature?: any;
    nonceKey: any;
    maxPriorityFeePerGas?: any;
    maxFeePerGas: any;
    nonce?: any;
    keyAuthorization?: any;
    gas: any;
    from?: any;
    feeToken?: any;
    accessList: any;
    account: Account;
    calls: any;
    chainId: any;
    feePayer: Account;
};
export declare class FeePayerValidationError extends Error {
    readonly name = "FeePayerValidationError";
    constructor(reason: string, details: Record<string, string>);
}
export {};
//# sourceMappingURL=fee-payer.d.ts.map