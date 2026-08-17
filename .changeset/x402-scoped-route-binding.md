---
'mppx': patch
---

Fixed scoped EVM charges rejecting every spec-compliant x402 client, which made
each route served through `Proxy` unpayable over x402.

A route scope lands in `challenge.meta`, and the x402 path treated any route
metadata as a demand for mppx's own `extensions.mppx` binding plus an EIP-3009
nonce equal to an unexported `sha256(accepted | resource | extensions)`. That
derivation is not part of the x402 spec, so a client mppx did not write cannot
produce it: the charge re-challenged forever with `Credential is malformed.`
`Proxy` attaches a derived scope to every charge it serves, so this applied to
everything behind it whether or not an operator set `scope`.

Such a credential is now bound the way x402 itself binds — by comparing the
echoed `resource` and `accepted` — instead of being rejected. A credential that
does carry `extensions.mppx` is still verified in full, including the
route-bound nonce, so mppx's own client is unaffected. Body binding is unchanged:
`challenge.digest` is verified against the request body either way.

The trade is that route scope on the x402 rail is advisory for clients that don't
implement mppx's binding. `resource` and `accepted` sit outside the EIP-3009
signature, so two charges sharing a URL and a price are no longer distinguishable
by scope alone. Cross-URL reuse is still refused. Operators who need scope
enforced can restore the previous behaviour per method:

```ts
evm({
  currency: evm.assets.base.USDC,
  recipient,
  x402: { facilitator, routeBinding: 'required' },
})
```
