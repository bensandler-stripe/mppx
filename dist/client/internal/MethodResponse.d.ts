import type * as Challenge from '../../Challenge.js';
import type { MaybePromise } from '../../internal/types.js';
import type * as Method from '../../Method.js';
/** Inputs available when a client method handles a successful paid response. */
export type HandlerParameters = {
    challenge: Challenge.Challenge;
    credential: string;
    fetch: typeof globalThis.fetch;
    headers: Headers;
    input: RequestInfo | URL;
    refetch?: (() => Promise<Response>) | undefined;
    response: Response;
    signal?: AbortSignal | undefined;
};
/** Internal client-method response adapter. */
export type Handler = (parameters: HandlerParameters) => MaybePromise<Response>;
/** Registers an internal response adapter without changing the public method shape. */
export declare function register<const method extends Method.AnyClient>(method: method, handler: Handler): method;
/** Removes response handling from a method whose caller owns the response lifecycle. */
export declare function unregister(method: Method.AnyClient): void;
/** Lets the selected client method handle a successful paid response. */
export declare function handle(method: Method.AnyClient, parameters: HandlerParameters): Promise<Response>;
//# sourceMappingURL=MethodResponse.d.ts.map