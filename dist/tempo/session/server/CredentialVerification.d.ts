import { type Account as viem_Account, type Address, type Hex } from 'viem';
import type * as Challenge from '../../../Challenge.js';
import type * as FeePayer from '../../internal/fee-payer.js';
import * as Chain from '../precompile/Chain.js';
import * as Channel from '../precompile/Channel.js';
import { type SessionCredentialPayload, type SessionReceipt } from '../precompile/Protocol.js';
import * as ChannelStore from './ChannelStore.js';
import { type OnSessionSettlement } from './Settlement.js';
/** Returns the effective voucher signer for a TIP-1034 descriptor. */
export declare function authorizedSigner(descriptor: Channel.ChannelDescriptor): Address;
/** Asserts that a credential payload includes a TIP-1034 descriptor. */
export declare function assertDescriptor(payload: {
    descriptor?: Channel.ChannelDescriptor | undefined;
}): asserts payload is {
    descriptor: Channel.ChannelDescriptor;
};
/** Asserts that two TIP-1034 descriptors identify the same channel. */
export declare function assertSameDescriptor(a: Channel.ChannelDescriptor, b: Channel.ChannelDescriptor): void;
/**
 * Validates a TIP-1034 descriptor against channel ID, server destination, and token.
 */
export declare function validateChannelDescriptor(descriptor: Channel.ChannelDescriptor, channelId: Address | `0x${string}`, chainId: number, escrow: Address, recipient: Address, currency: Address, expectedOperator?: Address | undefined): void;
/** Validates on-chain channel state before accepting or charging a credential. */
export declare function validateChannelState(state: Chain.ChannelState, amount?: bigint): void;
/** Asserts that an opening channel covers the route's requested payment. */
export declare function assertOpenCredentialCoversRequest(parameters: {
    cumulativeAmount: bigint;
    openDeposit: bigint;
    requestAmount: bigint;
}): void;
/** Verifies that the credential source is authorized to spend from the channel. */
export declare function assertCredentialSourceCanSpend(parameters: {
    chainId: number;
    channel: Pick<ChannelStore.State, 'authorizedSigner' | 'payer'>;
    source?: string | undefined;
}): void;
/** Shared action and channel fields required on every session credential payload. */
export type SessionCredentialPayloadHeader = {
    /** Credential action discriminator. */
    action: SessionCredentialPayload['action'];
    /** Channel ID the credential acts on. */
    channelId: Hex;
};
/** Validates the action discriminator for a TIP-1034 session credential payload. */
export declare function requireSessionCredentialAction(payload: unknown): SessionCredentialPayload['action'];
/** Validates the shared action and channel fields for a TIP-1034 session credential payload. */
export declare function requireSessionCredentialPayloadHeader(payload: unknown): SessionCredentialPayloadHeader;
/** Validates action-specific fields for a TIP-1034 session credential payload. */
export declare function requireSessionCredentialPayload(payload: unknown): SessionCredentialPayload;
/** Shared inputs required to verify a single precompile session credential payload. */
export type VerifyCredentialPayloadParameters = {
    /** Optional account override used for payee-side close settlement. */
    account?: viem_Account | undefined;
    /** Challenge echoed by the credential. */
    challenge: Challenge.Challenge;
    /** Milliseconds before voucher verification refreshes on-chain channel state. */
    channelStateTtl: number;
    /** Chain ID used for channel ID derivation and voucher domain separation. */
    chainId: number;
    /** viem client used for precompile reads and transaction broadcasts. */
    client: Chain.TransactionClient;
    /** Optional payer identifier from the HTTP credential source field. */
    credentialSource?: string | undefined;
    /** TIP20EscrowChannel precompile address for this session method. */
    escrow: Address;
    /** Operator address advertised in the HMAC-bound challenge details. */
    expectedOperator?: Address | undefined;
    /** Fee-payer account, or `true` when the client transport delegates co-signing to a hosted relay. */
    feePayer?: viem_Account | true | undefined;
    /** Optional policy for fee-sponsored close/open/top-up transactions. */
    feePayerPolicy?: Partial<FeePayer.Policy> | undefined;
    /** Optional fee token override for close transactions. */
    feeToken?: Address | undefined;
    /** Last successful on-chain refresh timestamp per channel ID. */
    lastOnChainVerified: Map<Hex, number>;
    /** Minimum allowed voucher delta in raw units. */
    minVoucherDelta: bigint;
    /** Callback invoked after an on-chain settlement or close transaction is confirmed. */
    onSessionSettlement?: OnSessionSettlement | undefined;
    /** Discriminated session credential payload to verify. */
    payload: SessionCredentialPayload;
    /** Server-side channel store. */
    store: ChannelStore.ChannelStore;
};
/** Narrows shared credential verification inputs to one payload action. */
export type VerifyCredentialActionParameters<action extends SessionCredentialPayload['action']> = Omit<VerifyCredentialPayloadParameters, 'payload'> & {
    /** Credential payload for the selected action. */
    payload: Extract<SessionCredentialPayload, {
        action: action;
    }>;
};
/** Inputs for verifying an open transaction credential and initial voucher. */
export type OpenCredentialActionParameters = VerifyCredentialActionParameters<'open'>;
/** Inputs for verifying a top-up transaction credential. */
export type TopUpCredentialActionParameters = VerifyCredentialActionParameters<'topUp'>;
/** Inputs for verifying and accepting an incremental voucher credential. */
export type VoucherCredentialActionParameters = VerifyCredentialActionParameters<'voucher'>;
/** Inputs for verifying and settling a cooperative close credential. */
export type CloseCredentialActionParameters = VerifyCredentialActionParameters<'close'>;
/** Verifies a session credential payload and applies the action-specific state transition. */
export declare function verifyCredentialPayload(context: VerifyCredentialPayloadParameters): Promise<SessionReceipt>;
//# sourceMappingURL=CredentialVerification.d.ts.map