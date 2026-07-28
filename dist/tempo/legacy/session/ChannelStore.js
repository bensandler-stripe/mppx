export { deductFromChannel, fromStore, normalizeChannelId, } from '../../session/server/ChannelStore.js';
/** Returns whether a channel is backed by the legacy smart contract escrow. */
export function isContractState(state) {
    return state.backend === undefined || state.backend === 'contract';
}
//# sourceMappingURL=ChannelStore.js.map