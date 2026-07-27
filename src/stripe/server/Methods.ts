import type * as Method from '../../Method.js'
import type * as Receipt from '../../Receipt.js'
import * as tempoDefaults from '../../tempo/internal/defaults.js'
import { charge as tempoCharge } from '../../tempo/server/Charge.js'
import { charge as evmCharge } from '../../evm/server/Charge.js'
import * as EvmAssets from '../../evm/Assets.js'
import { charge as charge_ } from './Charge.js'
import { resolveDepositAddress } from './internal/deposit-address.js'
import { recordCryptoPayment } from './internal/record-payment.js'

type TempoNetworkEntry = {
  network: 'tempo'
} & Partial<Omit<Parameters<typeof tempoCharge>[0], 'currency' | 'recipient'>>

type BaseNetworkEntry = {
  network: 'base'
} & Omit<Parameters<typeof evmCharge>[0], 'currency' | 'recipient'>

type CustomNetworkEntry = {
  network: string
  configure: (address: string) => Method.AnyServer | readonly Method.AnyServer[]
}

type AdditionalNetworkEntry = TempoNetworkEntry | BaseNetworkEntry | CustomNetworkEntry

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
export async function stripe<const parameters extends stripe.Parameters>(
  parameters: parameters,
): Promise<readonly Method.AnyServer[]> {
  const { secretKey, profileId, paymentMethodTypes } = parameters

  const methods: Method.AnyServer[] = []

  // Crypto methods: tempo is always on, additional networks are merged
  const cryptoMethods = await stripe.crypto({ secretKey, additional: parameters.additional })
  methods.push(...cryptoMethods)

  // SPT method: always on
  methods.push(
    stripe.spt({
      secretKey,
      networkId: profileId,
      paymentMethodTypes: paymentMethodTypes ?? ['card', 'link'],
    }),
  )

  return methods
}

export declare namespace stripe {
  type Parameters = {
    /** Stripe secret API key. */
    secretKey: string
    /** Stripe business network profile ID. */
    profileId: string
    /** Payment method types for SPT-based payments. @default ['card', 'link'] */
    paymentMethodTypes?: string[] | undefined
    /**
     * Additional crypto networks to enable beyond the defaults.
     * Entries with the same network name as a built-in override its config.
     */
    additional?: AdditionalNetworkEntry[] | undefined
  }
}

export namespace stripe {
  /**
   * Creates crypto payment methods. Tempo is always included.
   * Additional entries are merged, with duplicates resolved by preferring the additional entry.
   */
  export async function crypto(parameters: {
    secretKey: string
    additional?: AdditionalNetworkEntry[] | undefined
  }): Promise<readonly Method.AnyServer[]> {
    const { secretKey, additional = [] } = parameters
    const isTestMode = secretKey.includes('_test_')

    // Built-in defaults
    const defaults: AdditionalNetworkEntry[] = [{ network: 'tempo' }]

    // Merge: additional entries override defaults with the same network name
    const networkMap = new Map<string, AdditionalNetworkEntry>()
    for (const entry of defaults) {
      networkMap.set(entry.network, entry)
    }
    for (const entry of additional) {
      networkMap.set(entry.network, entry)
    }

    // Resolve all deposit addresses in parallel
    const entries = [...networkMap.values()]
    const resolved = await Promise.all(
      entries.map(async (entry) => ({
        entry,
        address: await resolveDepositAddress(secretKey, entry.network),
      })),
    )

    const methods: Method.AnyServer[] = []

    for (const { entry, address } of resolved) {
      if (!address) continue

      let methodOrMethods: Method.AnyServer | readonly Method.AnyServer[]

      if ('configure' in entry) {
        methodOrMethods = entry.configure(address)
      } else if (entry.network === 'tempo') {
        const { network: _, ...config } = entry
        methodOrMethods = tempoCharge({
          currency: (isTestMode
            ? tempoDefaults.tokens.pathUsd
            : tempoDefaults.tokens.usdc) as `0x${string}`,
          recipient: address as `0x${string}`,
          ...(isTestMode && { testnet: true }),
          ...config,
        })
      } else if (entry.network === 'base') {
        const { network: _, ...config } = entry
        methodOrMethods = evmCharge({
          currency: isTestMode ? EvmAssets.baseSepolia.USDC : EvmAssets.base.USDC,
          recipient: address as `0x${string}`,
          ...config,
        })
      } else {
        continue
      }

      // Wrap with Stripe payment recording
      const wrapped = Array.isArray(methodOrMethods)
        ? (methodOrMethods as readonly Method.AnyServer[]).map((m) =>
            wrapWithPaymentRecording(m, secretKey),
          )
        : [wrapWithPaymentRecording(methodOrMethods as Method.AnyServer, secretKey)]

      methods.push(...wrapped)
    }

    return methods
  }

  /** Creates a Stripe SPT charge method for card/link payments. */
  export const spt = charge_

  /** @deprecated Use `stripe.spt()` instead. */
  export const charge = charge_
}

/**
 * Wraps a method's verify function to record successful crypto payments
 * as Stripe PaymentIntents via transaction_verification.
 */
function wrapWithPaymentRecording(
  method: Method.AnyServer,
  secretKey: string,
): Method.AnyServer {
  const originalVerify = method.verify
  return {
    ...method,
    async verify(params: any): Promise<Receipt.Receipt> {
      const receipt = await originalVerify(params)
      const request = params.credential?.challenge?.request ?? params.request
      const amount = request?.amount
      if (receipt.reference && amount) {
        recordCryptoPayment({
          secretKey,
          method: receipt.method,
          reference: receipt.reference,
          amount: String(amount),
        })
      }
      return receipt
    },
  }
}
