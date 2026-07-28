import type { IncomingMessage, ServerResponse } from 'node:http';
import * as Challenge from '../Challenge.js';
import * as Credential from '../Credential.js';
import * as Errors from '../Errors.js';
import type { MaybePromise } from '../internal/types.js';
import * as Method from '../Method.js';
import type * as Receipt from '../Receipt.js';
import * as z from '../zod.js';
import * as Transport from './Transport.js';
export type Methods = readonly (Method.AnyServer | readonly Method.AnyServer[])[];
export type ServerEventMap<methods extends readonly Method.Method[] = readonly Method.Method[], transport extends Transport.AnyTransport = Transport.AnyTransport> = {
    'challenge.created': ChallengeContext<methods[number], transport>;
    'payment.failed': PaymentFailedContext<methods[number], transport>;
    'payment.success': PaymentSuccessContext<methods[number], transport>;
};
export type ServerEventName<methods extends readonly Method.Method[] = readonly Method.Method[], transport extends Transport.AnyTransport = Transport.AnyTransport> = keyof ServerEventMap<methods, transport> | '*';
export type ServerEventEnvelope<methods extends readonly Method.Method[] = readonly Method.Method[], transport extends Transport.AnyTransport = Transport.AnyTransport> = {
    [name in keyof ServerEventMap<methods, transport>]: Readonly<{
        name: name;
        payload: ServerEventMap<methods, transport>[name];
    }>;
}[keyof ServerEventMap<methods, transport>];
export type ServerEventPayload<methods extends readonly Method.Method[] = readonly Method.Method[], transport extends Transport.AnyTransport = Transport.AnyTransport, name extends ServerEventName<methods, transport> = ServerEventName<methods, transport>> = name extends '*' ? ServerEventEnvelope<methods, transport> : name extends keyof ServerEventMap<methods, transport> ? ServerEventMap<methods, transport>[name] : never;
/**
 * Server event handler.
 *
 * Handlers are awaited inline and sequentially on the payment request path.
 * Errors are swallowed so observers cannot change payment control flow, but
 * slow handlers still delay the response.
 */
export type ServerEventHandler<methods extends readonly Method.Method[] = readonly Method.Method[], transport extends Transport.AnyTransport = Transport.AnyTransport, name extends ServerEventName<methods, transport> = ServerEventName<methods, transport>> = (context: ServerEventPayload<methods, transport, name>) => MaybePromise<void>;
/** Removes a registered server event handler. */
export type Unsubscribe = () => void;
/** Inert method descriptor exposed to server event handlers. */
export type ServerMethodDescriptor<method extends Pick<Method.Method, 'intent' | 'name'> = Method.Method> = Readonly<{
    intent: method['intent'];
    name: method['name'];
}>;
/** Context passed to `onChallengeCreated`. */
export type ChallengeContext<method extends Method.Method = Method.Method, transport extends Transport.AnyTransport = Transport.AnyTransport> = Readonly<{
    capturedRequest?: Method.CapturedRequest | undefined;
    challenge: Challenge.Challenge;
    credential?: Credential.Credential | null | undefined;
    error?: Errors.PaymentError | undefined;
    input?: Transport.InputOf<transport> | undefined;
    method: ServerMethodDescriptor<method>;
    request: z.output<method['schema']['request']>;
}>;
/** Context passed to `onPaymentFailed`. */
export type PaymentFailedContext<method extends Method.Method = Method.Method, transport extends Transport.AnyTransport = Transport.AnyTransport> = Readonly<{
    capturedRequest?: Method.CapturedRequest | undefined;
    challenge: Challenge.Challenge;
    credential: Credential.Credential | null;
    error: Errors.PaymentError;
    input?: Transport.InputOf<transport> | undefined;
    method: ServerMethodDescriptor<method>;
    request: z.output<method['schema']['request']>;
    retryChallenge?: Challenge.Challenge | undefined;
    submittedChallenge?: Challenge.Challenge | undefined;
}>;
/** Context passed to `onPaymentSuccess`. */
export type PaymentSuccessContext<method extends Method.Method = Method.Method, transport extends Transport.AnyTransport = Transport.AnyTransport> = Readonly<{
    capturedRequest?: Method.CapturedRequest | undefined;
    challenge: Challenge.Challenge<z.output<method['schema']['request']>, method['intent'], method['name']>;
    credential?: Credential.Credential<z.output<method['schema']['credential']['payload']>, Challenge.Challenge<z.output<method['schema']['request']>, method['intent'], method['name']>> | undefined;
    envelope?: Method.VerifiedChallengeEnvelope<z.output<method['schema']['request']>, z.output<method['schema']['credential']['payload']>, method['intent'], method['name']> | undefined;
    input?: Transport.InputOf<transport> | undefined;
    method: ServerMethodDescriptor<method>;
    receipt: Receipt.Receipt;
    request: z.output<method['schema']['request']>;
}>;
/** Options for standalone credential verification. */
export type VerifyCredentialOptions = {
    capturedRequest?: Method.CapturedRequest | undefined;
    meta?: Record<string, string> | undefined;
    realm?: string | undefined;
    request?: Record<string, unknown> | undefined;
    /** Optional expected route/resource scope bound via challenge `opaque`. */
    scope?: string | undefined;
};
/**
 * Payment handler.
 */
export type Mppx<methods extends Methods = Methods, transport extends Transport.AnyTransport = Transport.Http> = {
    /** Methods to configure. */
    methods: FlattenMethods<methods>;
    /** Server realm (e.g., hostname). */
    realm: string;
    /** The transport used. */
    transport: transport;
    /** Register a server event handler by canonical event name. */
    on<name extends ServerEventName<FlattenMethods<methods>, transport>>(name: name, handler: ServerEventHandler<FlattenMethods<methods>, transport, name>): Unsubscribe;
    /** Register a handler for issued payment challenges. */
    onChallengeCreated(handler: ServerEventHandler<FlattenMethods<methods>, transport, 'challenge.created'>): Unsubscribe;
    /** Register a handler for failed submitted payment credentials. */
    onPaymentFailed(handler: ServerEventHandler<FlattenMethods<methods>, transport, 'payment.failed'>): Unsubscribe;
    /** Register a handler for successful verified payments. */
    onPaymentSuccess(handler: ServerEventHandler<FlattenMethods<methods>, transport, 'payment.success'>): Unsubscribe;
} & (transport extends Transport.Http ? {
    /**
     * Combines multiple method handlers into a single route handler that presents
     * all methods to the client via multiple `WWW-Authenticate` headers.
     *
     * Each entry is a `[method, options]` tuple where `method` is one of the
     * server methods passed to `Mppx.create()`, looked up by `name`+`intent`.
     *
     * Only available on HTTP transports.
     * No-credential authorize hooks run in entry order; the first 200 response
     * wins, and earlier hooks may have already run side effects.
     *
     * @example
     * ```ts
     * import { Mppx, tempo, stripe } from 'mppx/server'
     *
     * const mppx = Mppx.create({
     *   methods: [
     *     tempo.charge({ currency: USDC, recipient: '0x...' }),
     *     stripe.charge({
     *       client: stripeClient,
     *       networkId: 'internal',
     *       currency: 'usd',
     *       decimals: 2,
     *       paymentMethodTypes: ['card'],
     *     }),
     *   ],
     *   secretKey,
     * })
     *
     * app.get('/api/resource', async (req) => {
     *   const result = await mppx.compose(
     *     ['tempo/charge', { amount: '100' }],
     *     ['stripe/charge', { amount: '100' }],
     *   )(req)
     *   if (result.status === 402) return result.challenge
     *   return result.withReceipt(new Response('OK'))
     * })
     * ```
     */
    compose(...entries: ComposeEntry<FlattenMethods<methods>>[]): (input: Request) => Promise<MethodFn.Response<Transport.Http>>;
} : {}) & Handlers<FlattenMethods<methods>, transport> & {
    /**
     * Generate Challenge objects for registered methods without going through
     * the HTTP 402 request lifecycle. Uses the same options, defaults, and
     * schema transforms as the corresponding intent handler.
     *
     * @example
     * ```ts
     * const challenge = await mppx.challenge.tempo.charge({ amount: '25.92' })
     * ```
     */
    challenge: ChallengeHandlers<FlattenMethods<methods>>;
    /**
     * Verify a credential string or object end-to-end: deserialize,
     * HMAC-check, match to a registered method, validate payload schema,
     * check expiry, and call the method's broadcast or legacy verify function.
     *
     * Method verification can broadcast payments and persist state. For example,
     * subscription credentials may activate or renew a subscription. Failed
     * standalone verification emits `payment.failed` once a credential challenge
     * can be parsed; strings that cannot be deserialized have no challenge
     * context to report.
     *
     * @deprecated Use `broadcastCredential()` instead. This legacy name maps
     * to the same mutating operation and does not provide validation-only
     * semantics.
     *
     * @example
     * ```ts
     * const receipt = await mppx.verifyCredential('eyJjaGFsbGVuZ2...')
     * const receipt = await mppx.verifyCredential(credential)
     * const receipt = await mppx.verifyCredential(credential, { request: { amount: '1000' } })
     * ```
     */
    verifyCredential(credential: string | Credential.Credential, options?: VerifyCredentialOptions | undefined): Promise<Receipt.Receipt>;
    /**
     * Validate a credential without consuming or broadcasting it.
     *
     * This is an advisory pre-check. Methods that support it must not write
     * replay state, sign fee-payer transactions, broadcast, or otherwise
     * mutate payment state. Use `broadcastCredential()` when accepting payment.
     */
    validateCredential(credential: string | Credential.Credential, options?: VerifyCredentialOptions | undefined): Promise<Method.Validation>;
    /**
     * Re-validates and broadcasts a credential, returning a receipt.
     *
     * `verifyCredential()` is retained as a backwards-compatible alias for
     * this mutating path.
     */
    broadcastCredential(credential: string | Credential.Credential, options?: VerifyCredentialOptions | undefined): Promise<Receipt.Receipt>;
};
/** Extracts the transport override from a method, if any. */
type TransportOverrideOf<mi> = mi extends {
    transport?: infer transport;
} ? Exclude<transport, undefined> extends Transport.AnyTransport ? Exclude<transport, undefined> : never : never;
/** Resolves the effective transport for a method: override if present, else global default. */
type EffectiveTransportOf<mi, defaultTransport extends Transport.AnyTransport> = [
    TransportOverrideOf<mi>
] extends [never] ? defaultTransport : TransportOverrideOf<mi>;
declare const reservedMppxKeyValues: readonly ["challenge", "compose", "methods", "on", "onChallengeCreated", "onPaymentFailed", "onPaymentSuccess", "realm", "broadcastCredential", "transport", "validateCredential", "verifyCredential"];
/** Public instance keys that payment method names and shorthand intents cannot shadow. */
export type ReservedKey = (typeof reservedMppxKeyValues)[number];
/** Public instance keys that payment method names and shorthand intents cannot shadow. */
export declare const reservedMppxKeys: ReadonlySet<ReservedKey>;
/** True when exactly one method has the given intent (no name collision). */
type IsUniqueIntent<methods extends readonly Method.AnyServer[], intent extends string> = Extract<methods[number], {
    intent: intent;
}> extends infer M ? M extends M ? [Exclude<Extract<methods[number], {
    intent: intent;
}>, M>] extends [never] ? true : false : never : never;
/** Only includes shorthand intent keys when the intent is unique across methods. */
type UniqueIntentHandlers<methods extends readonly Method.AnyServer[], transport extends Transport.AnyTransport> = {
    [method_name in methods[number]['intent'] as IsUniqueIntent<methods, method_name> extends true ? method_name extends ReservedKey ? never : method_name : never]: MethodFn<Extract<methods[number], {
        intent: method_name;
    }>, EffectiveTransportOf<Extract<methods[number], {
        intent: method_name;
    }>, transport>, NonNullable<Extract<methods[number], {
        intent: method_name;
    }>['defaults']>> & MethodExtensions<Extract<methods[number], {
        intent: method_name;
    }>>;
};
/** Nested handlers: `mppx.tempo.charge(...)`, grouped by method name then intent. */
type PublicAlias<method extends Method.AnyServer> = method extends {
    alias?: infer alias;
} ? Exclude<alias, undefined> extends infer definedAlias ? definedAlias extends string ? string extends definedAlias ? never : definedAlias : never : never : never;
type PublicIntent<method extends Method.AnyServer> = [PublicAlias<method>] extends [never] ? method extends {
    intent: infer intent extends string;
} ? intent : never : PublicAlias<method>;
type NestedHandlers<methods extends readonly Method.AnyServer[], transport extends Transport.AnyTransport> = {
    [name in methods[number]['name'] as name extends ReservedKey ? never : name]: {
        [mi in Extract<methods[number], {
            name: name;
        }> as PublicIntent<mi>]: MethodFn<mi, EffectiveTransportOf<mi, transport>, NonNullable<mi['defaults']>> & MethodExtensions<mi> & {
            _method: mi;
        };
    };
};
type Handlers<methods extends readonly Method.AnyServer[], transport extends Transport.AnyTransport> = {
    [mi in methods[number] as `${mi['name']}/${mi['intent']}`]: MethodFn<mi, EffectiveTransportOf<mi, transport>, NonNullable<mi['defaults']>> & MethodExtensions<mi>;
} & UniqueIntentHandlers<methods, transport> & NestedHandlers<methods, transport> & {
    [mi in methods[number] as PublicAlias<mi> extends string ? `${mi['name']}/${PublicAlias<mi>}` : never]: MethodFn<mi, EffectiveTransportOf<mi, transport>, NonNullable<mi['defaults']>> & MethodExtensions<mi>;
};
type MethodExtensions<method extends Method.AnyServer> = method extends {
    extensions?: (infer extensions) | undefined;
} ? NonNullable<extensions> extends object ? NonNullable<extensions> : {} : {};
/** Nested challenge generators: `mppx.challenge.tempo.charge(...)`. */
type ChallengeHandlers<methods extends readonly Method.AnyServer[]> = {
    [name in methods[number]['name']]: {
        [mi in Extract<methods[number], {
            name: name;
        }> as PublicIntent<mi>]: ChallengeFn<mi, NonNullable<mi['defaults']>>;
    };
};
/** A function that generates a Challenge object from intent options. */
type ChallengeFn<method extends Method.Method, defaults extends Record<string, unknown>> = (options: MethodFn.Options<method, defaults>) => Promise<Challenge.Challenge>;
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
export declare function create<const methods extends Methods, const transport extends Transport.AnyTransport = Transport.Http>(config: create.Config<methods, transport>): Mppx<methods, transport>;
export declare namespace create {
    type Config<methods extends Methods = Methods, transport extends Transport.AnyTransport = Transport.Http> = {
        /** Array of configured methods. @example [tempo()] */
        methods: methods;
        /** Server realm (e.g., hostname). Resolution order: explicit value > env vars (`MPP_REALM`, `FLY_APP_NAME`, `VERCEL_URL`, etc.) > request URL hostname > `"MPP Payment"`. */
        realm?: string | undefined;
        /** Secret key for HMAC-bound challenge IDs for stateless verification. Must be at least 32 bytes. Auto-detected from `MPP_SECRET_KEY` environment variable. */
        secretKey?: string | undefined;
        /** Transport to use. @default Transport.http() */
        transport?: transport | undefined;
    };
}
/** Error thrown when `withReceipt()` needs a response but none was provided. */
export declare class MissingReceiptResponseError extends Error {
    name: string;
    constructor();
}
/** Returns true when an error is the typed `withReceipt()` no-response sentinel. */
export declare function isMissingReceiptResponseError(error: unknown): error is MissingReceiptResponseError;
export type MethodFn<method extends Method.Method, transport extends Transport.AnyTransport, defaults extends Record<string, unknown>> = (options: MethodFn.Options<method, defaults>) => (input: Transport.InputOf<transport>) => Promise<MethodFn.Response<transport>>;
/** @internal */
export type AnyMethodFn = (options: any) => (input: any) => Promise<any>;
/** @internal */
declare namespace MethodFn {
    type Options<method extends Method.Method, defaults extends Record<string, unknown> = Record<string, unknown>> = {
        /** Optional human-readable description of the payment. */
        description?: string | undefined;
        /** Optional challenge expiration timestamp (ISO 8601) or Date. */
        expires?: z.DatetimeInput | undefined;
        /** Optional server-defined correlation data (serialized as `opaque` in the request). Flat string-to-string map; clients MUST NOT modify. */
        meta?: Record<string, string> | undefined;
        /** Optional route/resource scope bound via reserved challenge metadata. */
        scope?: string | undefined;
    } & Method.WithDefaults<z.input<method['schema']['request']>, defaults>;
    type Response<transport extends Transport.AnyTransport = Transport.Http> = {
        challenge: Transport.ChallengeOutputOf<transport>;
        status: 402;
    } | {
        status: 200;
        withReceipt: Transport.WithReceipt<transport>;
    };
}
/** An entry for `compose()`: a method reference, handler function ref, or string key paired with its options. */
type ComposeEntry<methods extends readonly Method.AnyServer[]> = {
    [i in keyof methods]: readonly [
        methods[i],
        MethodFn.Options<methods[i], NonNullable<methods[i]['defaults']>>
    ];
}[number] | {
    [i in keyof methods]: readonly [
        `${methods[i]['name']}/${methods[i]['intent']}`,
        MethodFn.Options<methods[i], NonNullable<methods[i]['defaults']>>
    ];
}[number] | {
    [i in keyof methods]: readonly [
        MethodFn<methods[i], any, any> & {
            _method: methods[i];
        },
        MethodFn.Options<methods[i], NonNullable<methods[i]['defaults']>>
    ];
}[number];
export declare function compose(...args: readonly unknown[]): (input: Request) => Promise<MethodFn.Response<Transport.Http>>;
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
export declare function toNodeListener(handler: (input: globalThis.Request) => Promise<MethodFn.Response<Transport.Http>>): (req: IncomingMessage, res: ServerResponse) => Promise<MethodFn.Response<Transport.Http>>;
/**
 * Flattens a methods config tuple, preserving positional types.
 * @internal
 */
type FlattenMethods<methods extends Methods> = methods extends readonly [
    infer head,
    ...infer tail extends Methods
] ? head extends readonly Method.AnyServer[] ? readonly [...head, ...FlattenMethods<tail>] : head extends Method.AnyServer ? readonly [head, ...FlattenMethods<tail>] : never : readonly [];
export {};
//# sourceMappingURL=Mppx.d.ts.map