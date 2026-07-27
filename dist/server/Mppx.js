import { isDeepStrictEqual } from 'node:util';
import * as Challenge from '../Challenge.js';
import * as Constants from '../Constants.js';
import * as Credential from '../Credential.js';
import * as Errors from '../Errors.js';
import * as Expires from '../Expires.js';
import * as AcceptPayment from '../internal/AcceptPayment.js';
import * as Env from '../internal/env.js';
import * as Method from '../Method.js';
import * as PaymentRequest from '../PaymentRequest.js';
import * as x402_Header from '../x402/Header.js';
import * as x402_Types from '../x402/Types.js';
import * as z from '../zod.js';
import * as Html from './internal/html/config.js';
import { serviceWorker } from './internal/html/serviceWorker.gen.js';
import * as Scope from './internal/scope.js';
import * as NodeListener from './NodeListener.js';
import * as Request from './Request.js';
import * as Transport from './Transport.js';
const minimumSecretKeyBytes = 32;
const secretKeyGenerationCommand = 'openssl rand -base64 32';
const reservedMppxKeyValues = [
    'challenge',
    'compose',
    'methods',
    'on',
    'onChallengeCreated',
    'onPaymentFailed',
    'onPaymentSuccess',
    'realm',
    'broadcastCredential',
    'transport',
    'validateCredential',
    'verifyCredential',
];
/** Public instance keys that payment method names and shorthand intents cannot shadow. */
export const reservedMppxKeys = new Set(reservedMppxKeyValues);
/**
 * Creates a server-side payment handler from methods.
 *
 * It is highly recommended to set a `secretKey` to bind challenges to their contents,
 * and allow the server to verify that incoming credentials match challenges it issued.
 *
 * @example
 * ```ts
 * import { Mppx, tempo } from 'mppx/server'
 *
 * const payment = Mppx.create({
 *   methods: [tempo()],
 *   secretKey: process.env.PAYMENT_SECRET_KEY,
 * })
 * ```
 */
export function create(config) {
    const { realm = Env.get('realm'), secretKey = Env.get('secretKey'), transport = Transport.http(), } = config;
    if (!secretKey) {
        throw new Error('Missing secret key. Set the MPP_SECRET_KEY environment variable or pass `secretKey` to Mppx.create().');
    }
    assertSecretKey(secretKey);
    const methods = config.methods.flat();
    const serverEvents = createServerEventDispatcher();
    const handlers = {};
    const intentCount = {};
    for (const mi of methods) {
        intentCount[mi.intent] = (intentCount[mi.intent] ?? 0) + 1;
    }
    assertNoReservedMppxKeys(methods);
    for (const mi of methods) {
        const fn = createMethodFn({
            authorize: mi.authorize,
            defaults: mi.defaults,
            method: mi,
            realm,
            events: serverEvents,
            preflight: mi.preflight,
            request: mi.request,
            respond: mi.respond,
            broadcast: mi.broadcast,
            secretKey,
            stableBinding: mi.stableBinding,
            transport: (mi.transport ?? transport),
            validate: mi.validate,
            verify: mi.verify,
        });
        const wireKey = `${mi.name}/${mi.intent}`;
        const aliasKey = mi.alias ? `${mi.name}/${mi.alias}` : undefined;
        if (mi.extensions)
            Object.assign(fn, mi.extensions);
        if (!aliasKey || !handlers[wireKey])
            handlers[wireKey] = fn;
        if (aliasKey)
            handlers[aliasKey] = fn;
    }
    // Also set shorthand intent key when there's no collision
    for (const mi of methods) {
        if (intentCount[mi.intent] === 1)
            handlers[mi.intent] = handlers[`${mi.name}/${mi.intent}`];
    }
    // Build nested handlers: mppx.tempo.charge(...)
    for (const mi of methods) {
        if (!handlers[mi.name])
            handlers[mi.name] = {};
        const key = mi.alias ? `${mi.name}/${mi.alias}` : `${mi.name}/${mi.intent}`;
        const fn = handlers[key];
        fn._method = mi;
        handlers[mi.name][mi.alias ?? mi.intent] = fn;
    }
    // Build challenge generators: mppx.challenge.tempo.charge(...)
    const challengeHandlers = {};
    for (const mi of methods) {
        if (!challengeHandlers[mi.name])
            challengeHandlers[mi.name] = {};
        challengeHandlers[mi.name][mi.alias ?? mi.intent] = createChallengeFn({
            defaults: mi.defaults,
            method: mi,
            realm,
            request: mi.request,
            secretKey,
        });
    }
    async function prepareStandaloneCredential(input, options, parameters = {}) {
        const credential = hydrateCredentialMeta(typeof input === 'string' ? Credential.deserialize(input) : input);
        const emitFailures = parameters.emitFailures === true;
        const { method: credMethod, intent: credIntent } = credential.challenge;
        const methodCandidates = methods.filter((m) => m.name === credMethod && m.intent === credIntent);
        const mi = Method.selectServerMethod(methodCandidates, credential.challenge);
        const eventMethod = mi ?? { intent: credIntent, name: credMethod };
        const emitStandalonePaymentFailed = async (failure) => {
            if (!emitFailures)
                return;
            await serverEvents.emit('payment.failed', createPaymentFailedContext({
                capturedRequest: options?.capturedRequest,
                challenge: failure.challenge,
                credential: failure.credential,
                error: failure.error,
                method: eventMethod,
                request: failure.request,
                submittedChallenge: failure.submittedChallenge,
            }));
        };
        const fail = async (error, failure = {}, thrown = error) => {
            await emitStandalonePaymentFailed({
                challenge: credential.challenge,
                credential: failure.credential ?? credential,
                error,
                request: failure.request ?? credential.challenge.request,
                submittedChallenge: failure.submittedChallenge ?? credential.challenge,
            });
            throw thrown;
        };
        if (!mi) {
            await fail(new Errors.InvalidChallengeError({
                id: credential.challenge.id,
                reason: `no registered method for ${credMethod}/${credIntent}`,
            }));
        }
        if (parameters.requireValidate && !mi.validate)
            await fail(new Errors.VerificationFailedError({
                details: { intent: credIntent, method: credMethod },
                reason: `${credMethod}/${credIntent} does not support non-mutating credential validation`,
            }));
        if (!Challenge.verify(credential.challenge, { secretKey: secretKey })) {
            await fail(new Errors.InvalidChallengeError({
                id: credential.challenge.id,
                reason: 'challenge was not issued by this server',
            }));
        }
        try {
            Expires.assert(credential.challenge.expires, credential.challenge.id);
        }
        catch (e) {
            if (e instanceof Errors.PaymentError)
                await fail(e);
            throw e;
        }
        let parsedCredential;
        try {
            parsedCredential = withParsedCredentialPayload(credential, mi.schema.credential.payload.parse(credential.payload));
        }
        catch (e) {
            await fail(new Errors.InvalidPayloadError(), {}, e);
        }
        const expectedMeta = Scope.merge({ meta: options?.meta, scope: options?.scope });
        if (options?.scope !== undefined && Scope.read(credential.challenge.meta) !== options.scope) {
            await fail(new Errors.InvalidChallengeError({
                id: credential.challenge.id,
                reason: "credential scope does not match this route's requirements",
            }), { credential: parsedCredential });
        }
        const shouldValidateRoute = options?.capturedRequest !== undefined ||
            options?.meta !== undefined ||
            options?.realm !== undefined ||
            options?.request !== undefined;
        const expectedRealm = options?.realm ??
            realm ??
            (options?.capturedRequest === undefined ? credential.challenge.realm : undefined);
        let parsedRequest = credential.challenge.request;
        let request;
        try {
            request = shouldValidateRoute
                ? await resolveRouteChallenge({
                    capturedRequest: options?.capturedRequest,
                    credential: parsedCredential,
                    defaults: mi.defaults,
                    expires: credential.challenge.expires,
                    meta: expectedMeta,
                    method: mi,
                    realm: expectedRealm,
                    request: mi.request,
                    routeRequest: options?.request ?? {},
                    secretKey: secretKey,
                }).then((resolved) => {
                    const mismatch = getChallengeBindingMismatch(resolved.challenge, credential.challenge, mi.stableBinding);
                    if (mismatch)
                        throw new Errors.InvalidChallengeError({
                            id: credential.challenge.id,
                            reason: `credential ${mismatch} does not match this route's requirements`,
                        });
                    parsedRequest = resolved.parsedRequest;
                    return resolved.request;
                })
                : credential.challenge.request;
        }
        catch (e) {
            if (e instanceof Errors.PaymentError)
                await fail(e, {
                    credential: parsedCredential,
                    request: credential.challenge.request,
                });
            throw e;
        }
        const envelope = options?.capturedRequest
            ? {
                capturedRequest: options.capturedRequest,
                challenge: credential.challenge,
                credential: parsedCredential,
                request: parsedRequest,
            }
            : undefined;
        return {
            credential,
            envelope,
            eventMethod,
            method: mi,
            parsedCredential,
            parsedRequest,
            request,
        };
    }
    async function validateCredentialFn(input, options) {
        const prepared = await prepareStandaloneCredential(input, options, { requireValidate: true });
        return prepared.method.validate({
            credential: prepared.parsedCredential,
            envelope: prepared.envelope,
            request: prepared.request,
        });
    }
    // broadcastCredential: single-call end-to-end validation and broadcast
    async function broadcastCredentialFn(input, options) {
        const prepared = await prepareStandaloneCredential(input, options, { emitFailures: true });
        const { method: mi, parsedCredential, parsedRequest, request, envelope } = prepared;
        const emitStandalonePaymentFailed = async (parameters) => {
            await serverEvents.emit('payment.failed', createPaymentFailedContext({
                capturedRequest: options?.capturedRequest,
                challenge: parameters.challenge,
                credential: parameters.credential,
                error: parameters.error,
                method: prepared.eventMethod,
                request: parameters.request,
                submittedChallenge: parameters.submittedChallenge,
            }));
        };
        let receipt;
        try {
            if (mi.broadcast && mi.validate)
                await mi.validate({ credential: parsedCredential, envelope, request });
            const broadcast = mi.broadcast ?? mi.verify;
            receipt = await broadcast({ credential: parsedCredential, envelope, request });
        }
        catch (e) {
            const error = e instanceof Errors.PaymentError ? e : new Errors.VerificationFailedError();
            await emitStandalonePaymentFailed({
                challenge: prepared.credential.challenge,
                credential: parsedCredential,
                error,
                request: parsedRequest,
                submittedChallenge: prepared.credential.challenge,
            });
            throw e;
        }
        await serverEvents.emit('payment.success', createPaymentSuccessContext({
            capturedRequest: options?.capturedRequest,
            challenge: prepared.credential.challenge,
            credential: parsedCredential,
            envelope,
            method: mi,
            receipt,
            request: parsedRequest,
        }));
        return receipt;
    }
    const verifyCredentialFn = broadcastCredentialFn;
    function composeFn(...entries) {
        if (transport.name !== 'http')
            throw new Error('compose() only supports HTTP transport');
        if (entries.length === 0)
            throw new Error('compose() requires at least one entry');
        const configured = entries.map(([methodOrKey, options]) => {
            const key = typeof methodOrKey === 'string'
                ? methodOrKey
                : typeof methodOrKey === 'function' && '_method' in methodOrKey
                    ? `${methodOrKey._method.name}/${methodOrKey._method.alias ?? methodOrKey._method.intent}`
                    : `${methodOrKey.name}/${methodOrKey.alias ?? methodOrKey.intent}`;
            const handlerFn = handlers[key];
            if (!handlerFn)
                throw new Error(`No handler for "${key}". Is this method in your methods array?`);
            return handlerFn(options);
        });
        return compose(...configured);
    }
    function onChallengeCreated(handler) {
        return serverEvents.on('challenge.created', handler);
    }
    function onPaymentFailed(handler) {
        return serverEvents.on('payment.failed', handler);
    }
    function onPaymentSuccess(handler) {
        return serverEvents.on('payment.success', handler);
    }
    return {
        methods,
        challenge: challengeHandlers,
        compose: composeFn,
        on: serverEvents.on,
        onChallengeCreated,
        onPaymentFailed,
        onPaymentSuccess,
        realm: realm,
        broadcastCredential: broadcastCredentialFn,
        transport,
        validateCredential: validateCredentialFn,
        verifyCredential: verifyCredentialFn,
        ...handlers,
    };
}
function assertSecretKey(secretKey) {
    const byteLength = new TextEncoder().encode(secretKey).byteLength;
    if (byteLength >= minimumSecretKeyBytes)
        return;
    throw new Error(`Secret key must be at least ${minimumSecretKeyBytes} bytes. Generate one with \`${secretKeyGenerationCommand}\` and set MPP_SECRET_KEY or pass it to Mppx.create().`);
}
// biome-ignore lint/correctness/noUnusedVariables: _
function createMethodFn(parameters) {
    const { authorize, defaults, events, method, preflight, realm, respond, secretKey, broadcast, stableBinding, transport, validate, verify, } = parameters;
    return (options) => {
        const { description, meta, scope, ...rest } = options;
        const staticMeta = Scope.merge({ meta, scope });
        const internal = {
            ...method,
            ...defaults,
            ...options,
            ...(staticMeta !== undefined ? { meta: staticMeta } : {}),
            name: method.name,
            intent: method.intent,
            html: method.html,
            _canonicalRequest: PaymentRequest.fromMethod(method, { ...defaults, ...rest }),
            _stableBinding: stableBinding,
        };
        const handler = async (input) => {
            if (method.html && isServiceWorkerRequest(input))
                return {
                    status: 402,
                    challenge: createServiceWorkerResponse(),
                };
            const expires = 'expires' in options
                ? normalizeExpires(options.expires)
                : Expires.minutes(5);
            const capturedRequest = await captureRequest(transport, input);
            const effectiveMeta = scope === undefined && input instanceof globalThis.Request
                ? Scope.merge({ meta: staticMeta, scope: Scope.get(input) })
                : staticMeta;
            // Extract credential once — getCredential may have side effects (e.g. SSE transports).
            let [credential, credentialError] = (() => {
                try {
                    const credential = transport.getCredential(input);
                    return [credential ? hydrateCredentialMeta(credential) : null, undefined];
                }
                catch (e) {
                    return [null, e];
                }
            })();
            if (preflight && input instanceof globalThis.Request) {
                const response = await preflight({
                    capturedRequest,
                    credential,
                    expires,
                    input,
                    options: { ...defaults, ...rest },
                    realm: realm ?? new URL(input.url).hostname ?? 'MPP Payment',
                    secretKey,
                });
                if (response) {
                    if (response.status === 402)
                        return { challenge: response, status: 402 };
                    return {
                        status: 200,
                        withReceipt() {
                            return response;
                        },
                    };
                }
            }
            const emitChallenge = async (parameters) => {
                const response = await transport.respondChallenge({
                    challenge: parameters.challenge,
                    input,
                    ...(parameters.error && { error: parameters.error }),
                    ...(parameters.html && { html: parameters.html }),
                });
                if (isIssuedChallengeResponse(response))
                    await events.emit('challenge.created', createChallengeContext({
                        capturedRequest,
                        challenge: parameters.challenge,
                        credential: parameters.credential,
                        error: parameters.error,
                        input,
                        method,
                        request: parameters.request,
                    }));
                return response;
            };
            const emitPaymentFailed = async (parameters) => {
                await events.emit('payment.failed', createPaymentFailedContext({
                    capturedRequest,
                    challenge: parameters.challenge,
                    credential: parameters.credential,
                    error: parameters.error,
                    input,
                    method,
                    request: parameters.request,
                    retryChallenge: parameters.retryChallenge,
                    submittedChallenge: parameters.submittedChallenge,
                }));
            };
            const routeChallenge = await resolveRouteChallenge({
                capturedRequest,
                credential,
                defaults,
                description,
                expires,
                meta: effectiveMeta,
                method,
                realm,
                request: parameters.request,
                routeRequest: rest,
                secretKey,
            }).catch(async (e) => {
                if (!(e instanceof Errors.PaymentError))
                    throw e;
                const challenge = createFallbackChallenge({
                    capturedRequest,
                    defaults: defaults ?? {},
                    description,
                    expires,
                    meta: effectiveMeta,
                    method,
                    realm,
                    routeRequest: rest,
                    secretKey,
                });
                if (credential)
                    await emitPaymentFailed({
                        challenge,
                        credential,
                        error: e,
                        request: challenge.request,
                        retryChallenge: challenge,
                        submittedChallenge: credential.challenge,
                    });
                const response = await emitChallenge({
                    challenge,
                    credential,
                    request: challenge.request,
                    error: e,
                    html: method.html,
                });
                return { response };
            });
            if ('response' in routeChallenge)
                return { challenge: routeChallenge.response, status: 402 };
            const { challenge, parsedRequest, request } = routeChallenge;
            internal._canonicalRequest = parsedRequest;
            if (credential && transport.bindCredential) {
                try {
                    credential = hydrateCredentialMeta((await transport.bindCredential({
                        challenge,
                        credential,
                        input,
                    })));
                }
                catch (e) {
                    credential = null;
                    credentialError = e;
                }
            }
            // Credential was provided but malformed
            if (credentialError) {
                const reason = getSafeCredentialReason(credentialError);
                const error = new Errors.MalformedCredentialError(reason ? { reason } : {});
                await emitPaymentFailed({
                    challenge,
                    credential: null,
                    error,
                    request: parsedRequest,
                    retryChallenge: challenge,
                });
                const response = await emitChallenge({
                    challenge,
                    credential: null,
                    request: parsedRequest,
                    error,
                    html: method.html,
                });
                return { challenge: response, status: 402 };
            }
            const success = (receiptData, options = {}) => {
                const { challengeId = challenge.id, credentialForReceipt = { challenge, payload: {} }, envelopeForReceipt, managementResponse, } = options;
                return {
                    status: 200,
                    withReceipt(response) {
                        if (managementResponse) {
                            return transport.respondReceipt({
                                challengeId,
                                credential: credentialForReceipt,
                                ...(envelopeForReceipt ? { envelope: envelopeForReceipt } : {}),
                                input,
                                receipt: receiptData,
                                response: managementResponse,
                            });
                        }
                        if (!response)
                            throw new MissingReceiptResponseError();
                        return transport.respondReceipt({
                            challengeId,
                            credential: credentialForReceipt,
                            ...(envelopeForReceipt ? { envelope: envelopeForReceipt } : {}),
                            input,
                            receipt: receiptData,
                            response: response,
                        });
                    },
                };
            };
            // No credential provided—issue challenge
            if (!credential) {
                if (authorize && input instanceof globalThis.Request) {
                    try {
                        const authorized = await authorize({
                            challenge,
                            input,
                            request: challenge.request,
                        });
                        if (authorized) {
                            await events.emit('payment.success', createPaymentSuccessContext({
                                capturedRequest,
                                challenge,
                                input,
                                method,
                                receipt: authorized.receipt,
                                request: parsedRequest,
                            }));
                            return success(authorized.receipt, {
                                managementResponse: authorized.response,
                            });
                        }
                    }
                    catch (e) {
                        if (!(e instanceof Errors.PaymentError))
                            console.error('mppx: internal authorization error', e);
                        const error = e instanceof Errors.PaymentError ? e : new Errors.VerificationFailedError();
                        await emitPaymentFailed({
                            challenge,
                            credential: null,
                            error,
                            request: parsedRequest,
                            retryChallenge: challenge,
                        });
                        const response = await emitChallenge({
                            challenge,
                            request: parsedRequest,
                            error,
                            html: method.html,
                        });
                        return { challenge: response, status: 402 };
                    }
                }
                const error = new Errors.PaymentRequiredError({ description });
                const response = await emitChallenge({
                    challenge,
                    credential: null,
                    request: parsedRequest,
                    error,
                    html: method.html,
                });
                return { challenge: response, status: 402 };
            }
            // ── Tier 1: HMAC provenance check (primary gate) ──────────────────
            //
            // Recompute the HMAC-SHA256 over the credential's echoed challenge
            // parameters (realm|method|intent|request|expires|digest|opaque) and
            // compare to the echoed `id`. This proves the challenge was issued by
            // this server with these exact parameters — including opaque/meta,
            // expires, and the full serialized request blob.
            //
            // This is the authoritative binding per §5.1.2.1.1 of the spec
            // (https://paymentauth.org/draft-httpauth-payment-00.html#section-5.1.2.1.1).
            // No database lookup is needed; the HMAC is stateless verification.
            if (!Challenge.verify(credential.challenge, { secretKey })) {
                const error = new Errors.InvalidChallengeError({
                    id: credential.challenge.id,
                    reason: 'challenge was not issued by this server',
                });
                await emitPaymentFailed({
                    challenge,
                    credential,
                    error,
                    request: parsedRequest,
                    retryChallenge: challenge,
                    submittedChallenge: credential.challenge,
                });
                const response = await emitChallenge({
                    challenge,
                    credential,
                    request: parsedRequest,
                    error,
                    html: method.html,
                });
                return { challenge: response, status: 402 };
            }
            // ── Tier 2: Pinned field safety net ──────────────────────────────
            //
            // The HMAC check above (Tier 1) is the primary gate — it already
            // covers ALL challenge fields including opaque, digest, and the full
            // serialized request. So why this second check?
            //
            // The `request()` hook can produce credential-dependent output: for
            // example, `feePayer` may differ between the 402 challenge call (no
            // credential) and the credential-bearing call. This means the
            // recomputed challenge here has a different `request` blob — and
            // thus a different HMAC — than the original challenge the client
            // echoes back. The HMAC check above verifies the *echoed* challenge
            // was signed by us, but it cannot verify that the echoed challenge
            // matches *this route's current configuration* when the request
            // hook transforms fields between calls.
            //
            // This check compares the fields that MUST be stable across both
            // calls. That includes the economically significant request fields
            // plus `opaque`, which can carry route-scoping metadata (for example,
            // sibling route identity) that must not be replayable across handlers.
            // `expires` still is not pinned here because its default is generated
            // per invocation, and `digest` is already bound by the echoed HMAC.
            {
                const mismatch = getChallengeBindingMismatch(challenge, credential.challenge, stableBinding);
                if (mismatch) {
                    const error = new Errors.InvalidChallengeError({
                        id: credential.challenge.id,
                        reason: `credential ${mismatch} does not match this route's requirements`,
                    });
                    await emitPaymentFailed({
                        challenge,
                        credential,
                        error,
                        request: parsedRequest,
                        retryChallenge: challenge,
                        submittedChallenge: credential.challenge,
                    });
                    const response = await emitChallenge({
                        challenge,
                        credential,
                        request: parsedRequest,
                        error,
                        html: method.html,
                    });
                    return { challenge: response, status: 402 };
                }
            }
            // Reject credentials without expires (fail-closed) or with expired timestamp
            try {
                Expires.assert(credential.challenge.expires, credential.challenge.id);
            }
            catch (error) {
                await emitPaymentFailed({
                    challenge,
                    credential,
                    error: error,
                    request: parsedRequest,
                    retryChallenge: challenge,
                    submittedChallenge: credential.challenge,
                });
                const response = await emitChallenge({
                    challenge,
                    credential,
                    request: parsedRequest,
                    error: error,
                });
                return { challenge: response, status: 402 };
            }
            // Validate payload structure against method schema
            let parsedCredential;
            try {
                parsedCredential = withParsedCredentialPayload(credential, method.schema.credential.payload.parse(credential.payload));
            }
            catch {
                const error = new Errors.InvalidPayloadError();
                await emitPaymentFailed({
                    challenge,
                    credential,
                    error,
                    request: parsedRequest,
                    retryChallenge: challenge,
                    submittedChallenge: credential.challenge,
                });
                const response = await emitChallenge({
                    challenge,
                    credential,
                    request: parsedRequest,
                    error,
                });
                return { challenge: response, status: 402 };
            }
            const envelope = Object.freeze({
                capturedRequest,
                challenge: credential.challenge,
                credential: parsedCredential,
                request: parsedRequest,
            });
            // User-provided verification (e.g., check signature, submit tx, verify payment).
            // If verification fails, re-issue the challenge so the client can retry.
            let receiptData;
            try {
                if (broadcast && validate)
                    await validate({ credential: parsedCredential, envelope, request });
                const broadcastCredential = broadcast ?? verify;
                receiptData = await broadcastCredential({
                    credential: parsedCredential,
                    envelope,
                    request,
                });
            }
            catch (e) {
                if (!(e instanceof Errors.PaymentError))
                    console.error('mppx: internal verification error', e);
                const error = e instanceof Errors.PaymentError ? e : new Errors.VerificationFailedError();
                await emitPaymentFailed({
                    challenge,
                    credential: parsedCredential,
                    error,
                    request: parsedRequest,
                    retryChallenge: challenge,
                    submittedChallenge: credential.challenge,
                });
                const response = await emitChallenge({
                    challenge,
                    credential: parsedCredential,
                    request: parsedRequest,
                    error,
                });
                return { challenge: response, status: 402 };
            }
            // If the method's `respond` hook returns a Response, it means this
            // request is a management action (e.g. channel open, voucher POST)
            // and the user's route handler should NOT run. `withReceipt()` will
            // return the management response directly. If undefined, `withReceipt()`
            // expects the caller to pass the user handler's response instead.
            const managementResponse = respond
                ? await respond({
                    credential: parsedCredential,
                    envelope,
                    input,
                    receipt: receiptData,
                    request,
                })
                : undefined;
            await events.emit('payment.success', createPaymentSuccessContext({
                capturedRequest,
                challenge: credential.challenge,
                credential: parsedCredential,
                envelope,
                input,
                method,
                receipt: receiptData,
                request: parsedRequest,
            }));
            return success(receiptData, {
                challengeId: credential.challenge.id,
                credentialForReceipt: parsedCredential,
                envelopeForReceipt: envelope,
                managementResponse,
            });
        };
        return Object.assign(handler, { _internal: internal });
    };
}
/**
 * Creates a challenge generator for a single method+intent.
 * Applies the same defaults and request transform as createMethodFn,
 * but returns a Challenge object directly instead of a request handler.
 */
function createChallengeFn(parameters) {
    const { defaults, method, realm, secretKey } = parameters;
    return async (options) => {
        const { description, meta, scope, ...rest } = options;
        const effectiveMeta = Scope.merge({ meta, scope });
        const expires = 'expires' in options
            ? normalizeExpires(options.expires)
            : Expires.minutes(5);
        return resolveRouteChallenge({
            defaults,
            description,
            expires,
            meta: effectiveMeta,
            method,
            realm,
            request: parameters.request,
            routeRequest: rest,
            secretKey,
        }).then((resolved) => resolved.challenge);
    };
}
function createServerEventDispatcher() {
    const handlers = {
        '*': new Set(),
        'challenge.created': new Set(),
        'payment.failed': new Set(),
        'payment.success': new Set(),
    };
    const on = (name, handler) => {
        switch (name) {
            case '*':
            case 'challenge.created':
            case 'payment.failed':
            case 'payment.success':
                handlers[name].add(handler);
                return () => handlers[name].delete(handler);
            default:
                throw new Error(`Unknown server event "${String(name)}".`);
        }
    };
    return {
        async emit(name, context) {
            await emitServerEventHandlers(handlers[name], context);
            await emitServerEventHandlers(handlers['*'], toServerEventEnvelope(name, context));
        },
        on,
    };
}
function toServerEventEnvelope(name, payload) {
    return Object.freeze({ name, payload });
}
async function emitServerEventHandlers(handlers, context) {
    for (const handler of handlers) {
        try {
            await handler(context);
        }
        catch {
            // Errors are isolated, but handlers are still awaited inline.
        }
    }
}
function assertNoReservedMppxKeys(methods) {
    for (const method of methods) {
        if (reservedMppxKeys.has(method.name))
            throw new Error(`Method name "${method.name}" conflicts with a reserved Mppx property.`);
        if (reservedMppxKeys.has(method.intent))
            throw new Error(`Method intent "${method.intent}" conflicts with a reserved Mppx property.`);
    }
}
function createChallengeContext(parameters) {
    return Object.freeze({
        ...(parameters.capturedRequest
            ? { capturedRequest: snapshotCapturedRequest(parameters.capturedRequest) }
            : {}),
        challenge: snapshotValue(parameters.challenge),
        credential: parameters.credential === undefined
            ? undefined
            : snapshotNullableValue(parameters.credential),
        error: snapshotError(parameters.error),
        ...snapshotInputProperty(parameters.input),
        method: snapshotMethod(parameters.method),
        request: snapshotValue(parameters.request),
    });
}
function createPaymentFailedContext(parameters) {
    return Object.freeze({
        ...(parameters.capturedRequest
            ? { capturedRequest: snapshotCapturedRequest(parameters.capturedRequest) }
            : {}),
        challenge: snapshotValue(parameters.challenge),
        credential: snapshotNullableValue(parameters.credential),
        error: snapshotError(parameters.error),
        ...snapshotInputProperty(parameters.input),
        method: snapshotMethod(parameters.method),
        request: snapshotValue(parameters.request),
        ...(parameters.retryChallenge
            ? { retryChallenge: snapshotValue(parameters.retryChallenge) }
            : {}),
        ...(parameters.submittedChallenge
            ? { submittedChallenge: snapshotValue(parameters.submittedChallenge) }
            : {}),
    });
}
function createPaymentSuccessContext(parameters) {
    return Object.freeze({
        ...(parameters.capturedRequest
            ? { capturedRequest: snapshotCapturedRequest(parameters.capturedRequest) }
            : {}),
        challenge: snapshotValue(parameters.challenge),
        ...(parameters.credential ? { credential: snapshotValue(parameters.credential) } : {}),
        ...(parameters.envelope ? { envelope: snapshotVerifiedEnvelope(parameters.envelope) } : {}),
        ...snapshotInputProperty(parameters.input),
        method: snapshotMethod(parameters.method),
        receipt: snapshotValue(parameters.receipt),
        request: snapshotValue(parameters.request),
    });
}
function snapshotMethod(method) {
    return Object.freeze({
        intent: method.intent,
        name: method.name,
    });
}
function snapshotError(error) {
    if (!error)
        return error;
    const snapshot = Object.assign(Object.create(Object.getPrototypeOf(error)), error);
    Object.defineProperties(snapshot, {
        message: { value: error.message, enumerable: false },
        name: { value: error.name, enumerable: false },
    });
    return Object.freeze(snapshot);
}
function snapshotVerifiedEnvelope(envelope) {
    return Object.freeze({
        capturedRequest: snapshotCapturedRequest(envelope.capturedRequest),
        challenge: snapshotValue(envelope.challenge),
        credential: snapshotValue(envelope.credential),
        request: snapshotValue(envelope.request),
    });
}
function snapshotCapturedRequest(capturedRequest) {
    return Object.freeze({
        headers: new Headers(capturedRequest.headers),
        hasBody: capturedRequest.hasBody,
        method: capturedRequest.method,
        url: new URL(capturedRequest.url),
    });
}
function snapshotNullableValue(value) {
    if (value === null)
        return null;
    return snapshotValue(value);
}
function snapshotValue(value) {
    try {
        return freezeSnapshot(structuredClone(value));
    }
    catch {
        return freezeSnapshot(value);
    }
}
function snapshotInputProperty(input) {
    if (input === undefined)
        return {};
    const snapshot = snapshotTransportInput(input);
    return snapshot === undefined ? {} : { input: snapshot };
}
function snapshotTransportInput(input) {
    if (input instanceof globalThis.Request) {
        try {
            return new globalThis.Request(input.url, {
                headers: new Headers(input.headers),
                method: input.method,
            });
        }
        catch {
            return undefined;
        }
    }
    try {
        return freezeSnapshot(structuredClone(input));
    }
    catch {
        warnOnce(Warnings.transportInputSnapshot, 'Could not clone server event input; omitting `context.input`. Use `capturedRequest` for request correlation.');
        return undefined;
    }
}
// Event payloads are cloned before listeners see them; shallow freezing keeps
// the guard simple while preventing top-level mutation of receipts/challenges.
function freezeSnapshot(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value))
        return value;
    Object.freeze(value);
    return value;
}
function isServiceWorkerRequest(input) {
    return (input instanceof globalThis.Request &&
        new URL(input.url).searchParams.has(Html.params.serviceWorker));
}
function createServiceWorkerResponse() {
    return new Response(serviceWorker, {
        status: 200,
        headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-store',
        },
    });
}
function isIssuedChallengeResponse(response) {
    return !(response instanceof globalThis.Response) || response.status === 402;
}
function getSafeCredentialReason(error) {
    if (error instanceof Credential.InvalidCredentialEncodingError)
        return error.message;
    if (error instanceof Credential.MissingAuthorizationHeaderError)
        return error.message;
    if (error instanceof Credential.MissingPaymentSchemeError)
        return error.message;
    return undefined;
}
const defaultRealm = 'MPP Payment';
const Warnings = {
    realmFallback: 'realm-fallback',
    transportInputSnapshot: 'transport-input-snapshot',
};
const missingReceiptResponseErrorName = 'MissingReceiptResponseError';
const missingReceiptResponseErrorMessage = 'withReceipt() requires a response argument';
/** Error thrown when `withReceipt()` needs a response but none was provided. */
export class MissingReceiptResponseError extends Error {
    name = missingReceiptResponseErrorName;
    constructor() {
        super(missingReceiptResponseErrorMessage);
    }
}
/** Returns true when an error is the typed `withReceipt()` no-response sentinel. */
export function isMissingReceiptResponseError(error) {
    if (error instanceof MissingReceiptResponseError)
        return true;
    if (!error || typeof error !== 'object')
        return false;
    const value = error;
    return (value.name === missingReceiptResponseErrorName &&
        value.message === missingReceiptResponseErrorMessage);
}
function normalizeExpires(expires) {
    return expires === undefined ? undefined : z.toDatetimeString(expires);
}
const _warned = new Set();
function warnOnce(key, message) {
    if (_warned.has(key))
        return;
    _warned.add(key);
    console.warn(`[mppx] ${message}`);
}
/** Extracts hostname from the captured request URL, falling back to a default. */
function resolveRealmFromCapturedRequest(capturedRequest) {
    try {
        const { protocol, hostname } = capturedRequest.url;
        if (/^https?:$/.test(protocol) && hostname)
            return hostname;
    }
    catch { }
    warnOnce(Warnings.realmFallback, `Could not auto-detect realm from request. Falling back to "${defaultRealm}". Set \`realm\` in Mppx.create() or the MPP_REALM env var.`);
    return defaultRealm;
}
async function resolveRouteChallenge(parameters) {
    // Resolve the route's canonical request exactly as the handler path does:
    const request = await (async () => {
        // start from defaults + route options, then let the method request hook
        const merged = { ...parameters.defaults, ...parameters.routeRequest };
        // normalize or enrich it using the captured request and credential.
        return parameters.request
            ? (await parameters.request({
                capturedRequest: parameters.capturedRequest,
                credential: parameters.credential,
                request: merged,
            }))
            : merged;
    })();
    const effectiveRealm = parameters.realm ??
        (parameters.capturedRequest
            ? resolveRealmFromCapturedRequest(parameters.capturedRequest)
            : defaultRealm);
    const challenge = Challenge.fromMethod(parameters.method, {
        description: parameters.description,
        expires: parameters.expires,
        meta: parameters.meta,
        realm: effectiveRealm,
        request: request,
        secretKey: parameters.secretKey,
    });
    return {
        challenge,
        parsedRequest: challenge.request,
        request,
    };
}
function createFallbackChallenge(parameters) {
    return Challenge.fromMethod(parameters.method, {
        description: parameters.description,
        expires: parameters.expires,
        meta: parameters.meta,
        realm: parameters.realm ??
            (parameters.capturedRequest
                ? resolveRealmFromCapturedRequest(parameters.capturedRequest)
                : defaultRealm),
        request: { ...parameters.defaults, ...parameters.routeRequest },
        secretKey: parameters.secretKey,
    });
}
/**
 * Captures the transport request into a frozen snapshot at the start of the
 * verification flow. This snapshot is threaded through request() → verify() →
 * respond() → respondReceipt() so every hook sees the same authoritative
 * request state — preventing the raw transport input from being re-read or
 * mutated between verification steps.
 *
 * Note: Object.freeze is shallow — it prevents reassigning top-level properties
 * but does not deep-freeze mutable class instances like Headers or URL. This is
 * an accidental-mutation guard for trusted server events, not a security boundary.
 */
async function captureRequest(transport, input) {
    const capturedRequest = transport.captureRequest
        ? await transport.captureRequest(input)
        : captureRequestFromInput(input);
    return Object.freeze(capturedRequest);
}
function captureRequestFromInput(input) {
    const source = input;
    return {
        headers: new Headers(source.headers),
        hasBody: source.body === undefined ? undefined : source.body !== null,
        method: source.method ?? 'POST',
        url: Transport.safeUrl(source.url),
    };
}
const coreBindingFields = ['amount', 'currency', 'recipient'];
const methodBindingFields = ['chainId', 'memo', 'sessionProtocol', 'splits', 'unitType'];
const pinnedRequestBindingFields = [...coreBindingFields, ...methodBindingFields];
function getChallengeBindingMismatch(expectedChallenge, actualChallenge, stableBinding) {
    if (!stableBinding)
        return getPinnedChallengeMismatch(expectedChallenge, actualChallenge);
    for (const field of ['method', 'intent', 'realm']) {
        if (actualChallenge[field] !== expectedChallenge[field])
            return field;
    }
    if (!opaqueValuesMatch(expectedChallenge.meta, actualChallenge.meta))
        return 'opaque';
    return getRequestBindingMismatch(getStableBinding(expectedChallenge.request, stableBinding), getStableBinding(actualChallenge.request, stableBinding));
}
/**
 * Compares only the fields that MUST be stable across request-hook transforms.
 *
 * This is NOT the primary integrity check — the HMAC binding (Challenge.verify)
 * already covers every challenge field including opaque, digest, and the full
 * serialized request. This function exists as a secondary safety net for the
 * case where the `request()` hook produces credential-dependent output, causing
 * the recomputed challenge to differ from the original in non-economic fields
 * (e.g. `feePayer`). We only need to verify that the economically significant
 * subset hasn't drifted.
 */
function getPinnedChallengeMismatch(expectedChallenge, actualChallenge) {
    for (const field of ['method', 'intent', 'realm']) {
        if (actualChallenge[field] !== expectedChallenge[field])
            return field;
    }
    if (!opaqueValuesMatch(expectedChallenge.meta, actualChallenge.meta))
        return 'opaque';
    return getPinnedRequestBindingMismatch(expectedChallenge.request, actualChallenge.request);
}
function getPinnedRequestBindingMismatch(expectedRequest, actualRequest) {
    const expected = getPinnedRequestBinding(expectedRequest);
    const actual = getPinnedRequestBinding(actualRequest);
    return (getCoreBindingMismatch(expected.coreBinding, actual.coreBinding) ??
        getMethodBindingMismatch(expected.methodBinding, actual.methodBinding));
}
function getCoreBindingMismatch(expected, actual) {
    return coreBindingFields.find((field) => !isDeepStrictEqual(expected[field], actual[field]));
}
function getMethodBindingMismatch(expected, actual) {
    return methodBindingFields.find((field) => !isDeepStrictEqual(expected[field], actual[field]));
}
function getPinnedRequestBinding(request) {
    const methodDetails = (request.methodDetails ?? {});
    const amount = normalizeScalar(request.amount ?? methodDetails.amount);
    const chainId = normalizeScalar(request.chainId ?? methodDetails.chainId);
    const currency = normalizeScalar(request.currency ?? methodDetails.currency);
    const memo = normalizeHex(methodDetails.memo);
    const recipient = normalizeScalar(request.recipient ?? methodDetails.recipient);
    const sessionProtocol = normalizeScalar(methodDetails.sessionProtocol);
    const splits = normalizeComparable(methodDetails.splits);
    const unitType = normalizeScalar(request.unitType ?? methodDetails.unitType);
    return {
        coreBinding: {
            ...(amount !== undefined ? { amount } : {}),
            ...(currency !== undefined ? { currency } : {}),
            ...(recipient !== undefined ? { recipient } : {}),
        },
        methodBinding: {
            ...(chainId !== undefined ? { chainId } : {}),
            ...(memo !== undefined ? { memo } : {}),
            ...(sessionProtocol !== undefined ? { sessionProtocol } : {}),
            ...(splits !== undefined ? { splits } : {}),
            ...(unitType !== undefined ? { unitType } : {}),
        },
    };
}
function getRequestBindingMismatch(expected, actual) {
    const fields = [
        ...Object.keys(expected),
        ...Object.keys(actual).filter((key) => !(key in expected)),
    ];
    return fields.find((field) => !isDeepStrictEqual(normalizeComparable(expected[field]), normalizeComparable(actual[field])));
}
function getStableBinding(request, stableBinding) {
    return stableBinding(request);
}
function normalizeScalar(value) {
    return value === undefined ? undefined : String(value);
}
function normalizeHex(value) {
    if (value === undefined)
        return undefined;
    const normalized = String(value);
    return normalized.startsWith('0x') ? normalized.toLowerCase() : normalized;
}
function normalizeComparable(value) {
    if (value === undefined)
        return undefined;
    if (Array.isArray(value))
        return value.map(normalizeComparable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, normalizeComparable(nested)]));
    }
    return typeof value === 'string' ? normalizeHex(value) : value;
}
function opaqueValuesMatch(expected, actual) {
    return isDeepStrictEqual(expected, actual);
}
function hydrateCredentialMeta(credential) {
    const { challenge } = credential;
    if (challenge.opaque === undefined)
        return credential;
    const hydratedChallenge = Challenge.Schema.parse({
        ...challenge,
        meta: PaymentRequest.deserialize(challenge.opaque),
    });
    return {
        ...credential,
        challenge: hydratedChallenge,
    };
}
function withParsedCredentialPayload(credential, payload) {
    return {
        ...credential,
        payload,
    };
}
const paymentAuthChallengeHeader = Constants.Headers.wwwAuthenticate;
const challengeHeaderMerges = [
    {
        name: paymentAuthChallengeHeader,
        values: (context) => context.challengeEntries
            .map((entry) => entry.result.challenge.headers.get(paymentAuthChallengeHeader))
            .filter((value) => value !== null),
        merge: (values) => values,
    },
    {
        name: x402_Types.paymentRequiredHeader,
        values: (context) => context.negotiatedChallengeResponses
            .map((response) => response.headers.get(x402_Types.paymentRequiredHeader))
            .filter((value) => value !== null),
        merge: mergeX402PaymentRequiredHeaders,
    },
];
export function compose(...args) {
    // Extract optional html options from last argument
    const last = args[args.length - 1];
    const composeOptions = typeof last === 'object' &&
        last !== null &&
        typeof last !== 'function' &&
        !('_internal' in last)
        ? (() => {
            const opts = last;
            return {
                config: {},
                content: '',
                formatAmount: () => '',
                text: opts.text,
                theme: opts.theme,
            };
        })()
        : undefined;
    const handlers = (composeOptions ? args.slice(0, -1) : args);
    if (handlers.length === 0)
        throw new Error('compose() requires at least one handler');
    return async (input) => {
        // Serve service worker for html-enabled compose
        if (new URL(input.url).searchParams.has(Html.params.serviceWorker)) {
            const hasHtml = handlers.some((h) => h._internal?.html);
            if (hasHtml)
                return {
                    status: 402,
                    challenge: new Response(serviceWorker, {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/javascript',
                            'Cache-Control': 'no-store',
                        },
                    }),
                };
        }
        // Try to extract a Payment credential to decide whether to dispatch or challenge.
        // Only gate on the Payment scheme — other auth schemes (Bearer, Basic, etc.)
        // should fall through to the merged-402 path so all offers are presented.
        const header = input.headers.get(Constants.Headers.authorization);
        const paymentHeader = header ? Credential.extractPaymentScheme(header) : null;
        if (paymentHeader) {
            // Parse the credential to find method+intent for dispatch.
            let credential;
            try {
                credential = hydrateCredentialMeta(Credential.deserialize(paymentHeader));
            }
            catch { }
            if (credential) {
                const { method: credMethod, intent: credIntent } = credential.challenge;
                const credReq = credential.challenge.request;
                // Filter by name+intent, then narrow by comparing stable request fields
                // from the echoed challenge against each handler's canonical request.
                // Uses the schema-parsed canonical form (not raw options) so that
                // transformed fields (e.g. amount with decimals) match correctly.
                // Also checks inside methodDetails for fields moved there by transforms.
                const candidates = handlers.filter((h) => {
                    try {
                        const internal = h._internal;
                        if (!internal || internal.name !== credMethod || internal.intent !== credIntent)
                            return false;
                        const mismatch = internal._stableBinding
                            ? getRequestBindingMismatch(getStableBinding(internal._canonicalRequest, internal._stableBinding), getStableBinding(credReq, internal._stableBinding))
                            : getPinnedRequestBindingMismatch(internal._canonicalRequest, credReq);
                        return !mismatch && opaqueValuesMatch(internal.meta, credential.challenge.meta);
                    }
                    catch {
                        return false;
                    }
                });
                const match = candidates[0] ??
                    handlers.find((h) => {
                        const meta = h._internal;
                        return meta?.name === credMethod && meta?.intent === credIntent;
                    });
                if (match)
                    return match(input);
            }
            // Payment credential present but no matching handler — dispatch to first
            // handler which will reject with an appropriate error (invalid challenge, etc.).
            return handlers[0](input);
        }
        // No credential — evaluate handlers sequentially so authorize()/renewal hooks
        // can safely claim the request without racing each other.
        const results = [];
        for (const handler of handlers) {
            const result = await handler(input);
            if (result.status === 200)
                return result;
            results.push(result);
        }
        const challengeEntries = (() => {
            const entries = [];
            for (let i = 0; i < handlers.length; i++) {
                const result = results[i];
                if (result?.status !== 402)
                    continue;
                const response = result.challenge;
                const wwwAuth = response.headers.get(paymentAuthChallengeHeader);
                if (!wwwAuth)
                    continue;
                entries.push({
                    handler: handlers[i],
                    challenge: Challenge.deserialize(wwwAuth),
                    result,
                });
            }
            const acceptPayment = input.headers.get(Constants.Headers.acceptPayment);
            if (!acceptPayment)
                return entries;
            try {
                const ranked = AcceptPayment.rank(entries.map((entry) => entry.challenge), AcceptPayment.parse(acceptPayment));
                if (ranked.length === 0)
                    return entries;
                const entriesById = new Map(entries.map((entry) => [entry.challenge.id, entry]));
                return ranked.map((challenge) => entriesById.get(challenge.id));
            }
            catch {
                return entries;
            }
        })();
        const challengeResponses = results.flatMap((result) => result.status === 402 ? [result.challenge] : []);
        const unnegotiatedX402Responses = input.headers.has(Constants.Headers.acceptPayment) || challengeEntries.length === 0
            ? []
            : challengeResponses.filter((response) => response.headers.has(x402_Types.paymentRequiredHeader) &&
                !response.headers.has(paymentAuthChallengeHeader));
        const negotiatedChallengeResponses = challengeEntries.length > 0
            ? [
                ...challengeEntries.map((entry) => entry.result.challenge),
                ...unnegotiatedX402Responses,
            ]
            : challengeResponses;
        // Merge challenge headers from the negotiated 402 responses.
        const mergedHeaders = new Headers();
        mergedHeaders.set('Cache-Control', 'no-store');
        for (const header of challengeHeaderMerges) {
            for (const value of header.merge(header.values({
                challengeEntries,
                challengeResponses,
                negotiatedChallengeResponses,
            }))) {
                mergedHeaders.append(header.name, value);
            }
        }
        // Collect html-enabled handlers and their challenges
        const htmlEntries = challengeEntries.filter((entry) => entry.handler._internal?.html);
        const wantsHtml = input.headers.get('Accept')?.includes('text/html');
        if (wantsHtml && htmlEntries.length > 0) {
            const { theme, text } = Html.resolveOptions(
            // Use compose-level options or first html-enabled method's config for the page shell
            composeOptions ?? htmlEntries[0]?.handler._internal.html ?? {});
            // Build data map keyed by challenge.id
            const dataMap = {};
            for (let i = 0; i < htmlEntries.length; i++) {
                const entry = htmlEntries[i];
                dataMap[entry.challenge.id] = {
                    label: entry.handler._internal.name,
                    rootId: `${Html.ids.root}-${i}`,
                    formattedAmount: await entry.handler._internal.html.formatAmount(entry.challenge.request),
                    config: entry.handler._internal.html.config,
                    challenge: entry.challenge,
                    text,
                    theme,
                };
            }
            mergedHeaders.set('Content-Type', 'text/html; charset=utf-8');
            const firstData = Object.values(dataMap)[0];
            const body = Html.render({
                entries: htmlEntries.map((entry) => ({
                    challenge: entry.challenge,
                    content: entry.handler._internal.html.content,
                })),
                dataMap,
                formattedAmount: firstData.formattedAmount,
                panels: true,
                text,
                theme,
            });
            return {
                status: 402,
                challenge: new Response(body, { status: 402, headers: mergedHeaders }),
            };
        }
        // Non-HTML fallback: prefer the first Payment-auth body, otherwise use
        // the first transport-specific 402 body.
        let body = null;
        const bodyResponses = challengeEntries.length > 0
            ? challengeEntries.map((entry) => entry.result.challenge)
            : challengeResponses;
        for (const response of bodyResponses) {
            if (!body) {
                const contentType = response.headers.get('Content-Type');
                if (contentType)
                    mergedHeaders.set('Content-Type', contentType);
                body = await response.text();
                break;
            }
        }
        return {
            status: 402,
            challenge: new Response(body, { status: 402, headers: mergedHeaders }),
        };
    };
}
function mergeX402PaymentRequiredHeaders(values) {
    if (values.length === 0)
        return [];
    const [first, ...rest] = values.map((value) => x402_Header.decodePaymentRequired(value));
    if (!first)
        throw new Error('Expected at least one x402 payment-required header.');
    const incompatible = rest.some((value) => !isDeepStrictEqual(value.resource, first.resource) ||
        !isDeepStrictEqual(value.extensions, first.extensions));
    if (incompatible)
        return [
            x402_Header.encodePaymentRequired({
                ...first,
                error: [first.error, 'Cannot merge x402 payment requirements with different resources.']
                    .filter((value) => value !== undefined && value.length > 0)
                    .join('; '),
            }),
        ];
    const error = [first.error, ...rest.map((value) => value.error)]
        .filter((value) => value !== undefined && value.length > 0)
        .join('; ');
    return [
        x402_Header.encodePaymentRequired({
            ...first,
            accepts: [first.accepts, ...rest.map((value) => value.accepts)].flat(),
            ...(error ? { error } : {}),
        }),
    ];
}
/**
 * Wraps a payment handler to create a Node.js HTTP listener.
 *
 * On 402: writes the challenge response and ends the connection.
 * On 200: sets the Payment-Receipt header; caller should write response body.
 *
 * @example
 * ```ts
 * import * as http from 'node:http'
 * import { Mppx } from 'mppx/server'
 *
 * const payment = Mppx.create({ ... })
 *
 * http.createServer(async (req, res) => {
 *   const result = await Mppx.toNodeListener(
 *     payment.charge({
 *       amount: '1', currency: '...', recipient: '0x...',
 *     }),
 *   )(req, res)
 *   if (result.status === 402) return
 *   res.end('OK')
 * })
 * ```
 */
export function toNodeListener(handler) {
    return async (req, res) => {
        const result = await handler(Request.fromNodeListener(req, res));
        if (result.status === 402) {
            await NodeListener.sendResponse(res, result.challenge);
        }
        else {
            const managementResponse = getManagementResponse(result);
            if (managementResponse) {
                await NodeListener.sendResponse(res, managementResponse);
                return { challenge: managementResponse, status: 402 };
            }
            const wrapped = result.withReceipt(new globalThis.Response());
            for (const [name, value] of wrapped.headers)
                res.setHeader(name, value);
        }
        return result;
    };
}
function getManagementResponse(result) {
    try {
        return result.withReceipt();
    }
    catch (error) {
        if (isMissingReceiptResponseError(error)) {
            return null;
        }
        throw error;
    }
}
//# sourceMappingURL=Mppx.js.map