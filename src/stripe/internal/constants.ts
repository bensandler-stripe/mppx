/**
 * Stripe API version with `.preview` suffix.
 *
 * Required for `shared_payment_granted_token` (SPTs are in private preview).
 * Bump this when upgrading to a newer Stripe API version.
 */
export const stripePreviewVersion = '2026-07-29.preview'

/** Identifies Stripe API requests made by mppx for machine-payment flows. */
export const stripeXRequestSource = 'service="mppx"; project="machine_payments"'
