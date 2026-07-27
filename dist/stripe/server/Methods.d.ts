import type * as Method from '../../Method.js';
import { charge as tempoCharge } from '../../tempo/server/Charge.js';
import { charge as evmCharge } from '../../evm/server/Charge.js';
import { charge as charge_ } from './Charge.js';
type TempoNetworkEntry = {
    network: 'tempo';
} & Partial<Omit<Parameters<typeof tempoCharge>[0], 'currency' | 'recipient'>>;
type BaseNetworkEntry = {
    network: 'base';
} & Omit<Parameters<typeof evmCharge>[0], 'currency' | 'recipient'>;
type CustomNetworkEntry = {
    network: string;
    configure: (address: string) => Method.AnyServer | readonly Method.AnyServer[];
};
type AdditionalNetworkEntry = TempoNetworkEntry | BaseNetworkEntry | CustomNetworkEntry;
/**
 * Creates all Stripe-supported MPP payment methods from a single configuration.
 *
 * Opinionated: always enables Tempo crypto and SPT (card/link) payments.
 * Pass `additional` to enable more crypto networks (e.g. Base, Solana).
 *
 * Crypto payments are automatically recorded as Stripe PaymentIntents
 * via transaction verification for unified accounting in the Stripe Dashboard.
 *
 * @example
 * ```ts
 * import { Mppx, stripe } from 'mppx/server'
 *
 * // Minimal: tempo + cards/link
 * const mppx = Mppx.create({
 *   methods: [await stripe({ secretKey: 'sk_...', profileId: '...' })],
 * })
 * ```
 *
 * @example
 * ```ts
 * import { stripe } from 'mppx/server'
 * import { solana } from '@solana/mpp/server'
 *
 * // Add Base and Solana
 * const methods = await stripe({
 *   secretKey: 'sk_...',
 *   profileId: '...',
 *   additional: [
 *     { network: 'base', x402: { facilitator } },
 *     { network: 'solana', configure: (address) => solana.charge({ recipient: address, currency: USDC, decimals: 6 }) },
 *   ],
 * })
 * ```
 */
export declare function stripe<const parameters extends stripe.Parameters>(parameters: parameters): Promise<readonly Method.AnyServer[]>;
export declare namespace stripe {
    type Parameters = {
        /** Stripe secret API key. */
        secretKey: string;
        /** Stripe business network profile ID. */
        profileId: string;
        /** Payment method types for SPT-based payments. @default ['card', 'link'] */
        paymentMethodTypes?: string[] | undefined;
        /**
         * Additional crypto networks to enable beyond the defaults.
         * Entries with the same network name as a built-in override its config.
         */
        additional?: AdditionalNetworkEntry[] | undefined;
    };
}
export declare namespace stripe {
    /**
     * Creates crypto payment methods. Tempo is always included.
     * Additional entries are merged, with duplicates resolved by preferring the additional entry.
     */
    function crypto(parameters: {
        secretKey: string;
        additional?: AdditionalNetworkEntry[] | undefined;
    }): Promise<readonly Method.AnyServer[]>;
    /** Creates a Stripe SPT charge method for card/link payments. */
    const spt: typeof charge_;
    /** @deprecated Use `stripe.spt()` instead. */
    const charge: typeof charge_;
}
export {};
//# sourceMappingURL=Methods.d.ts.map