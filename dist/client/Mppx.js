import * as Expires from '../Expires.js';
import * as AcceptPayment from '../internal/AcceptPayment.js';
import * as Fetch from './internal/Fetch.js';
import * as Transport from './Transport.js';
/**
 * Creates a client-side payment handler from an array of methods.
 *
 * Returns a payment handler with a `fetch` function that automatically handles
 * 402 Payment Required responses. By default, also polyfills `globalThis.fetch`.
 *
 * @example
 * ```ts
 * import { Mppx, tempo } from 'mppx/client'
 *
 * const mppx = Mppx.create({
 *   methods: [tempo({ account })],
 * })
 *
 * // Use the returned fetch — handles 402 automatically
 * const res = await mppx.fetch('/resource')
 *
 * // Or use globalThis.fetch (polyfilled by default)
 * const res2 = await fetch('/resource')
 * ```
 */
export function create(config) {
    const { maxPaymentRetries, onChallenge, orderChallenges, polyfill = true, acceptPaymentPolicy = polyfill && typeof globalThis.location !== 'undefined'
        ? 'same-origin'
        : 'always', transport = Transport.http(), } = config;
    const rawFetch = config.fetch ?? globalThis.fetch;
    const methods = config.methods.flat();
    const acceptPayment = AcceptPayment.resolve(methods, config.paymentPreferences);
    const events = Fetch.createEventDispatcher();
    const resolvedOnChallenge = onChallenge;
    const config_fetch = {
        acceptPayment,
        acceptPaymentPolicy,
        ...(config.fetch && { fetch: config.fetch }),
        eventDispatcher: events,
        ...(maxPaymentRetries !== undefined && { maxPaymentRetries }),
        ...(resolvedOnChallenge && { onChallenge: resolvedOnChallenge }),
        ...(orderChallenges && { orderChallenges }),
        methods,
        transport,
    };
    const fetch = Fetch.from(config_fetch);
    if (polyfill)
        Fetch.polyfill(config_fetch);
    function onChallengeReceived(handler) {
        return events.on('challenge.received', handler);
    }
    function onCredentialCreated(handler) {
        return events.on('credential.created', handler);
    }
    function onPaymentFailed(handler) {
        return events.on('payment.failed', handler);
    }
    function onPaymentResponse(handler) {
        return events.on('payment.response', handler);
    }
    return {
        fetch,
        rawFetch,
        methods,
        transport,
        on: events.on,
        onChallengeReceived,
        onCredentialCreated,
        onPaymentFailed,
        onPaymentResponse,
        async createCredential(response, context, options) {
            const challenges = transport.getChallenges
                ? await transport.getChallenges(response)
                : [await transport.getChallenge(response)];
            const preferences = resolveChallengePreferences(acceptPayment.entries, options?.acceptPayment);
            let challenge;
            let mi;
            try {
                const candidates = AcceptPayment.selectChallengeCandidates(challenges, methods, preferences);
                const orderedCandidates = await resolveChallengeOrder(candidates, options?.orderChallenges ?? orderChallenges);
                const selected = orderedCandidates[0];
                if (!selected)
                    throw new Error(`No method found for challenges: ${challenges.map((challenge) => `${challenge.method}.${challenge.intent}`).join(', ')}. Available: ${methods.map((m) => `${m.name}.${m.intent}`).join(', ')}`);
                const selectedChallenge = selected.challenge;
                challenge = selectedChallenge;
                mi = selected.method;
                if (challenge.expires)
                    Expires.assert(challenge.expires, challenge.id);
                const createCredential = memoizeCreateCredential((overrideContext) => createCredentialForMethod(selectedChallenge, mi, overrideContext ?? context));
                const eventCredential = await events.emit('challenge.received', createChallengeReceivedPayload({
                    challenge: selectedChallenge,
                    challenges,
                    createCredential,
                    method: mi,
                    response,
                }));
                const credential = eventCredential ?? (await createCredential());
                Fetch.validateCredentialHeaderValue(credential);
                await events.emit('credential.created', createCredentialCreatedPayload({
                    challenge: selectedChallenge,
                    credential,
                    method: mi,
                    response,
                }));
                return credential;
            }
            catch (error) {
                await events.emit('payment.failed', createPaymentFailedPayload({
                    challenge,
                    challenges,
                    error,
                    method: mi,
                    response,
                }));
                throw error;
            }
        },
    };
}
/**
 * Restores the original `fetch` after `create()` polyfilled it.
 *
 * @example
 * ```ts
 * import { Mppx, tempo } from 'mppx/client'
 *
 * Mppx.create({ methods: [tempo({ account })] })
 *
 * // ... use payment-aware fetch ...
 *
 * Mppx.restore()
 * ```
 */
export function restore() {
    Fetch.restore();
}
function memoizeCreateCredential(createCredential) {
    let promise;
    return (context) => {
        promise ??= createCredential(context);
        return promise;
    };
}
function createChallengeReceivedPayload(parameters) {
    return Object.freeze({
        challenge: snapshotValue(parameters.challenge),
        challenges: parameters.challenges.map((challenge) => snapshotValue(challenge)),
        createCredential: parameters.createCredential,
        method: snapshotMethod(parameters.method),
        response: snapshotResponse(parameters.response),
    });
}
function createCredentialCreatedPayload(parameters) {
    return Object.freeze({
        challenge: snapshotValue(parameters.challenge),
        credential: parameters.credential,
        method: snapshotMethod(parameters.method),
        response: snapshotResponse(parameters.response),
    });
}
function createPaymentFailedPayload(parameters) {
    return Object.freeze({
        ...(parameters.challenge ? { challenge: snapshotValue(parameters.challenge) } : {}),
        ...(parameters.challenges
            ? { challenges: parameters.challenges.map((challenge) => snapshotValue(challenge)) }
            : {}),
        error: parameters.error,
        ...(parameters.method ? { method: snapshotMethod(parameters.method) } : {}),
        response: snapshotResponse(parameters.response),
    });
}
function snapshotMethod(method) {
    return freezeSnapshot(Object.assign({}, method));
}
function snapshotResponse(response) {
    if (response instanceof Response)
        return response.clone();
    return snapshotValue(response);
}
function snapshotValue(value) {
    try {
        return deepFreeze(structuredClone(value));
    }
    catch {
        return freezeSnapshot(value);
    }
}
function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value))
        return value;
    Object.freeze(value);
    for (const child of Object.values(value))
        deepFreeze(child);
    return value;
}
function freezeSnapshot(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value))
        return value;
    Object.freeze(value);
    return value;
}
function resolveChallengePreferences(fallback, override) {
    if (!override)
        return fallback;
    return typeof override === 'string' ? AcceptPayment.parse(override) : override;
}
async function resolveChallengeOrder(candidates, orderChallenges) {
    return orderChallenges ? orderChallenges(candidates) : candidates;
}
async function createCredentialForMethod(challenge, mi, context) {
    const parsedContext = mi.context && context !== undefined ? mi.context.parse(context) : undefined;
    return mi.createCredential(parsedContext !== undefined ? { challenge, context: parsedContext } : { challenge });
}
//# sourceMappingURL=Mppx.js.map