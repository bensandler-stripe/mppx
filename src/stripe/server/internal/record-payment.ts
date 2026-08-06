import type { StripeClient } from '../../internal/types.js'
import type { stripe } from '../Methods.js'
import { createPaymentIntent, type ConnectConfig } from './request.js'

const NETWORK_CONFIG: Record<stripe.Network, { stripeNetworkName: string; tokenDecimals: number }> =
  {
    tempo: { stripeNetworkName: 'tempo', tokenDecimals: 6 },
    base: { stripeNetworkName: 'base', tokenDecimals: 6 },
    solana: { stripeNetworkName: 'solana', tokenDecimals: 6 },
  }

/**
 * Records a crypto payment as a Stripe PaymentIntent using transaction_verification mode.
 * Fire-and-forget: errors are logged but never thrown.
 */
export function recordCryptoPayment(
  client: StripeClient,
  parameters: {
    network: stripe.Network
    reference: string
    amount: string
    connect?: ConnectConfig
  },
): void {
  const { network, reference, amount, connect } = parameters
  const { stripeNetworkName, tokenDecimals } = NETWORK_CONFIG[network]

  const amountCents = Math.round(Number(amount) / 10 ** (tokenDecimals - 2))
  if (amountCents < 1) {
    throw new Error(
      `[stripe] sub-cent crypto payment: ${amount} raw units on ${network} = ${amountCents} cents`,
    )
  }

  createPaymentIntent(
    client,
    {
      amount: amountCents,
      currency: 'usd',
      confirm: true,
      payment_method_data: { type: 'crypto' },
      payment_method_types: ['crypto'],
      payment_method_options: {
        crypto: {
          mode: 'transaction_verification',
          transaction_verification_options: {
            network: stripeNetworkName,
            transaction_hash: reference,
          },
        },
      },
    },
    {
      idempotencyKey: reference,
      ...(connect && { connect }),
    },
  ).catch((err) => {
    console.error('[stripe] failed to record crypto payment:', err)
  })
}
