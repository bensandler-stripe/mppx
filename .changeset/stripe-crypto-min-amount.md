---
'mppx': patch
---

Reject sub-cent amounts via `canOffer` before issuing 402 challenge on stripe-managed crypto rails. Add `metadata` parameter to `stripe.create()` for forwarding key-value pairs to Stripe PaymentIntents.
