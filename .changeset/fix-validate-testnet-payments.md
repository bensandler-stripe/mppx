---
'mppx': patch
---

Fixed `mppx validate` intermittently reporting a false `InsufficientBalance`
error when paying with an ephemeral Tempo testnet wallet, mislabeling
resolved chains in payment errors, and skipping other payment methods after
a Tempo testnet challenge succeeded.
