import { session as sessionLegacy_, settle as settleLegacy_ } from '../legacy/server/index.js';
import { charge as sessionCharge_, session as session_, settle as settle_, settleBatch as settleBatch_, } from '../session/server/Session.js';
import * as Ws_ from '../session/server/Ws.js';
import { charge as charge_ } from './Charge.js';
import { renew as renewSubscription_, subscription as subscription_ } from './Subscription.js';
const sessionServer = Object.assign(session_, {
    charge: sessionCharge_,
    settle: settle_,
    settleBatch: settleBatch_,
});
function createSessionLegacyMethod(parameters) {
    return Object.assign(sessionLegacy_(parameters), { alias: 'sessionLegacy' });
}
const sessionLegacyServer = Object.assign(createSessionLegacyMethod, {
    settle: settleLegacy_,
    Ws: Ws_,
});
/** Creates a legacy contract-backed Tempo `session` server method. */
export const sessionLegacy = sessionLegacyServer;
/** Settles a legacy contract-backed Tempo session channel. */
export const settleLegacy = settleLegacy_;
function createChargeMethod(parameters) {
    // `tempo()` accepts the intersection of charge/session parameters, then
    // forwards only the fields each method understands. Preserve the inferred
    // parameter type so configured request defaults remain visible to handlers.
    return tempo.charge(parameters);
}
function createSessionMethod(parameters) {
    // See `createChargeMethod()`: session receives the same shared parameter bag.
    return sessionServer(parameters);
}
/**
 * Creates the common Tempo `charge` and `session` methods from shared parameters.
 *
 * When configured, `relay` applies to the `charge` method. Session vouchers
 * remain local state transitions and session relay delegation will be added
 * with its action-specific lifecycle support.
 *
 * @example
 * ```ts
 * import { Mppx, tempo } from 'mppx/server'
 *
 * const mppx = Mppx.create({
 *   methods: [tempo.common({ currency: '0x...', recipient: '0x...' })],
 * })
 * ```
 */
export function tempo(parameters) {
    return [createChargeMethod(parameters), createSessionMethod(parameters)];
}
(function (tempo) {
    /** Creates a Tempo `charge` method for one-time TIP-20 token transfers. */
    tempo.charge = charge_;
    /** Creates the common Tempo `charge` and `session` methods from shared parameters. */
    tempo.common = tempo;
    /** Creates a TIP-1034 Tempo `session` method for session-based TIP-20 token payments. */
    tempo.session = sessionServer;
    /** @deprecated Use `tempo.session()` for the TIP-1034 session server method. */
    tempo.sessionLegacy = sessionLegacyServer;
    /** Creates a Tempo `subscription` method for recurring TIP-20 token payments. */
    tempo.subscription = subscription_;
    /** Renews an overdue Tempo subscription outside of the HTTP request path. */
    tempo.renewSubscription = renewSubscription_;
    /** One-shot settle: reads highest voucher from storage and submits on-chain. */
    tempo.settle = settle_;
    /** Batch-settle precompile-backed session channels. */
    tempo.settleBatch = settleBatch_;
    /** Experimental websocket helpers for Tempo sessions. */
    tempo.Ws = Ws_;
})(tempo || (tempo = {}));
//# sourceMappingURL=Methods.js.map