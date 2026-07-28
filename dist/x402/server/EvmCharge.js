import { isDeepStrictEqual } from 'node:util';
import { Bytes, Hash } from 'ox';
import { getAddress } from 'viem';
import * as BodyDigest from '../../BodyDigest.js';
import * as Challenge from '../../Challenge.js';
import * as Credential_ from '../../Credential.js';
import { VerificationFailedError } from '../../Errors.js';
import * as Types from '../../evm/Types.js';
import * as PaymentRequest from '../../PaymentRequest.js';
import * as Scope from '../../server/internal/scope.js';
import * as x402_Header from '../Header.js';
import * as x402_RouteBinding from '../internal/RouteBinding.js';
import * as x402_Types from '../Types.js';
import * as x402_Facilitator from './Facilitator.js';
const pendingX402Credential = Symbol('mppx.evm.pendingX402Credential');
const x402Credential = Symbol('mppx.evm.x402Credential');
const mppxExtensionKey = 'mppx';
const mppxRouteBindingSchema = {
    additionalProperties: false,
    properties: {
        [Scope.reservedMetaKey]: { type: 'string' },
        digest: { type: 'string' },
        method: { type: 'string' },
        nonce: { type: 'string' },
        opaque: { type: 'string' },
    },
    required: ['method'],
    type: 'object',
};
/** Resolves optional x402 compatibility options for an EVM charge. */
export function resolveOptions(parameters) {
    return {
        authorization: parameters.authorization,
        ...(parameters.options?.facilitator
            ? {
                facilitator: x402_Facilitator.resolve(parameters.options.facilitator, 'EVM authorization x402 requires `facilitator`.', { fetch: parameters.options.fetch }),
            }
            : {}),
        maxTimeoutSeconds: parameters.options?.maxTimeoutSeconds ?? 300,
    };
}
/** Creates the x402 wire path for an EVM charge method. */
export function createPath(config) {
    return {
        getCredential(request) {
            const paymentSignature = request.headers.get(x402_Types.paymentSignatureHeader);
            if (!paymentSignature)
                return null;
            const paymentPayload = x402_Header.decodePaymentSignature(paymentSignature);
            return markPendingCredential(Credential_.from({
                challenge: pendingChallenge(paymentPayload),
                payload: paymentPayload,
            }));
        },
        async bindCredential({ challenge, credential, input }) {
            const paymentPayload = parsePaymentPayload(credential.payload);
            if (!paymentPayload)
                return credential;
            if (!isPendingCredential(credential))
                return credential;
            await assertBodyDigest(challenge, input);
            const request = challenge.request;
            const paymentRequirements = toPaymentRequirements(request, config);
            if (!isDeepStrictEqual(paymentPayload.accepted, paymentRequirements))
                throw new VerificationFailedError({
                    reason: 'x402 payment payload does not match route requirements',
                });
            const expectedResource = { url: input.url };
            if (!isDeepStrictEqual(paymentPayload.resource, expectedResource))
                throw new VerificationFailedError({
                    reason: 'x402 payment payload resource does not match route resource',
                });
            const expectedExtensions = routeExtensions(challenge, input);
            if (!containsExtensions(paymentPayload.extensions, expectedExtensions))
                throw new VerificationFailedError({
                    reason: 'x402 payment payload extensions do not match route binding',
                });
            const payload = payloadToAuthorization(paymentPayload);
            const expectedNonce = x402_RouteBinding.nonce({
                accepted: paymentRequirements,
                extensions: paymentPayload.extensions,
                resource: expectedResource,
            });
            if (payload.nonce !== expectedNonce)
                throw new VerificationFailedError({
                    reason: 'x402 authorization nonce does not match route binding',
                });
            return markCredential(Credential_.from({
                challenge,
                payload,
                source: Types.toSource({
                    address: getAddress(payload.from),
                    chainId: request.methodDetails.chainId,
                }),
            }));
        },
        respondChallenge(options, response) {
            if (!response)
                throw new Error('x402 path requires a base challenge response.');
            if (options.input.body !== null && options.challenge.digest === undefined)
                return response;
            const headers = new Headers(response.headers);
            const request = options.challenge.request;
            headers.set(x402_Types.paymentRequiredHeader, x402_Header.encodePaymentRequired({
                accepts: [toPaymentRequirements(request, config)],
                error: options.error?.message ?? `${x402_Types.paymentSignatureHeader} header is required`,
                extensions: routeExtensions(options.challenge, options.input),
                resource: { url: options.input.url },
                x402Version: 2,
            }));
            return new Response(response.body, {
                headers,
                status: response.status,
                statusText: response.statusText,
            });
        },
        respondReceipt(options, response) {
            if (!options.input.headers.has(x402_Types.paymentSignatureHeader))
                return response;
            const payload = Types.AuthorizationPayloadSchema.parse(options.credential.payload);
            const request = options.credential.challenge.request;
            const headers = new Headers(response.headers);
            headers.set(x402_Types.paymentResponseHeader, x402_Header.encodePaymentResponse({
                network: Types.networkOf(request.methodDetails.chainId),
                payer: payload.from,
                success: true,
                transaction: options.receipt.reference,
            }));
            return new Response(response.body, {
                headers,
                status: response.status,
                statusText: response.statusText,
            });
        },
    };
}
/** Settles a verified EVM authorization through an x402 facilitator. */
export function settleWithFacilitator(parameters) {
    const { facilitator, maxTimeoutSeconds } = parameters;
    if (!facilitator)
        throw new Error('EVM authorization x402 requires `facilitator`.');
    return async ({ payload, request }) => {
        const paymentRequirements = toPaymentRequirements(request, {
            ...parameters,
            maxTimeoutSeconds,
        });
        const paymentPayload = {
            accepted: paymentRequirements,
            payload: {
                authorization: {
                    from: payload.from,
                    nonce: payload.nonce,
                    to: payload.to,
                    validAfter: payload.validAfter,
                    validBefore: payload.validBefore,
                    value: payload.value,
                },
                signature: payload.signature,
            },
            x402Version: 2,
        };
        const verified = await facilitator.verify(paymentPayload, paymentRequirements);
        if (!verified.isValid)
            throw new VerificationFailedError({
                reason: verified.invalidMessage ?? verified.invalidReason ?? 'EVM facilitator verify failed',
            });
        const settled = await facilitator.settle(paymentPayload, paymentRequirements);
        if (!settled.success)
            throw new VerificationFailedError({
                reason: settled.errorMessage ?? settled.errorReason ?? 'EVM facilitator settlement failed',
            });
        return {
            reference: settled.transaction,
        };
    };
}
/** Returns whether a credential was converted from an x402 payment payload. */
export function isCredential(credential) {
    return credential[x402Credential] === true;
}
/** Returns whether a credential was parsed from the x402 payment header. */
export function isPendingCredential(credential) {
    return credential[pendingX402Credential] === true;
}
/** Converts a native EVM charge request to x402 exact payment requirements. */
export function toPaymentRequirements(request, config) {
    return {
        amount: request.amount,
        asset: request.currency,
        extra: {
            assetTransferMethod: Types.eip3009,
            name: config.authorization.name,
            version: config.authorization.version,
        },
        maxTimeoutSeconds: config.maxTimeoutSeconds,
        network: Types.networkOf(request.methodDetails.chainId),
        payTo: request.recipient,
        scheme: 'exact',
    };
}
function parsePaymentPayload(payload) {
    const parsed = x402_Types.PaymentPayloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : undefined;
}
/** Converts an x402 EIP-3009 payment payload to the native EVM authorization payload. */
export function payloadToAuthorization(paymentPayload) {
    if (!('authorization' in paymentPayload.payload))
        throw new VerificationFailedError({
            reason: 'EVM charge only supports x402 EIP-3009 authorization payloads',
        });
    return Types.AuthorizationPayloadSchema.parse({
        ...paymentPayload.payload.authorization,
        signature: paymentPayload.payload.signature,
        type: 'authorization',
    });
}
function pendingChallenge(paymentPayload) {
    // The route challenge is built after request normalization in bindCredential().
    // Until then, this deterministic local ID only carries the x402 payload through
    // the standard credential pipeline; it is never HMAC-verified.
    return Challenge.from({
        id: pendingChallengeId(paymentPayload),
        intent: Types.chargeIntent,
        method: Types.paymentMethod,
        realm: 'x402',
        request: paymentPayload.accepted,
    });
}
function pendingChallengeId(paymentPayload) {
    const hash = Hash.sha256(Bytes.fromString(JSON.stringify(paymentPayload)), { as: 'Hex' });
    return `${x402_Types.syntheticChallengeIdPrefix}${hash}`;
}
function routeExtensions(challenge, input) {
    const binding = { method: input.method };
    const scope = Scope.read(challenge.meta);
    if (scope !== undefined)
        binding[Scope.reservedMetaKey] = scope;
    if (challenge.digest !== undefined)
        binding.digest = challenge.digest;
    const opaque = challenge.opaque ?? (challenge.meta ? PaymentRequest.serialize(challenge.meta) : undefined);
    if (opaque !== undefined)
        binding.opaque = opaque;
    return {
        [mppxExtensionKey]: {
            info: binding,
            schema: mppxRouteBindingSchema,
        },
    };
}
function containsExtensions(actual, expected) {
    if (!actual)
        return false;
    return Object.entries(expected).every(([key, expectedExtension]) => {
        const actualExtension = actual[key];
        return (actualExtension !== undefined &&
            isDeepStrictEqual(actualExtension.schema, expectedExtension.schema) &&
            isDeepStrictEqual(stripClientNonce(actualExtension.info), expectedExtension.info));
    });
}
function stripClientNonce(info) {
    const { nonce, ...rest } = info;
    if (nonce !== undefined && typeof nonce !== 'string')
        return info;
    return rest;
}
async function assertBodyDigest(challenge, input) {
    if (input.body === null)
        return;
    if (challenge.digest === undefined)
        throw new VerificationFailedError({
            reason: 'x402 payment requires a body digest for body-bearing requests',
        });
    let body;
    try {
        body = await input.clone().text();
    }
    catch {
        throw new VerificationFailedError({
            reason: 'x402 payment cannot bind streaming request body',
        });
    }
    if (!BodyDigest.verify(challenge.digest, body))
        throw new VerificationFailedError({
            reason: 'x402 payment body digest mismatch',
        });
}
function markPendingCredential(credential) {
    Object.defineProperty(credential, pendingX402Credential, {
        enumerable: true,
        value: true,
    });
    return credential;
}
function markCredential(credential) {
    Object.defineProperty(credential, x402Credential, {
        enumerable: true,
        value: true,
    });
    return credential;
}
//# sourceMappingURL=EvmCharge.js.map