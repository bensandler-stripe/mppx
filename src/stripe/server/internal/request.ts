import { stripePreviewVersion } from '../../internal/constants.js'
import type { StripeClient } from '../../internal/types.js'

export type ConnectConfig = {
  stripeAccount: string
  applicationFeeAmount?: number
  onBehalfOf?: string
  transferData?: { amount?: number; destination: string }
  transferGroup?: string
}

/** Creates a Stripe PaymentIntent using the SDK client. Handles Connect param mapping. */
export async function createPaymentIntent(
  client: StripeClient,
  params: Record<string, unknown>,
  options?: { idempotencyKey?: string; connect?: ConnectConfig },
): Promise<{ id: string; status: string; replayed: boolean }> {
  const connect = options?.connect
  const fullParams = {
    ...params,
    ...(connect && {
      application_fee_amount: connect.applicationFeeAmount,
      on_behalf_of: connect.onBehalfOf,
      transfer_data: connect.transferData,
      transfer_group: connect.transferGroup,
    }),
  }
  const result = await client.paymentIntents.create(fullParams as any, {
    apiVersion: stripePreviewVersion,
    idempotencyKey: options?.idempotencyKey,
    stripeAccount: connect?.stripeAccount,
  })
  const replayed = result.lastResponse?.headers?.['idempotent-replayed'] === 'true'
  return { id: result.id, status: result.status, replayed }
}

/** Makes a raw Stripe API request using the SDK client. */
export async function stripeRequest(
  client: StripeClient,
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, unknown>,
  options?: { connect?: ConnectConfig },
): Promise<unknown> {
  return client.rawRequest!(method, path, method === 'GET' ? undefined : params, {
    apiVersion: stripePreviewVersion,
    stripeAccount: options?.connect?.stripeAccount,
  })
}
