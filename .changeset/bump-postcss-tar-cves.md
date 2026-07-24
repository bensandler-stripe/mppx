---
'mppx': patch
---

Bumped `postcss` (via `vite`/`vite-plus`) and `tar` (via `prool`) to patched
versions, resolving a path-traversal advisory in `postcss`'s source map
loading and a stack-overflow DoS advisory in `tar`'s path filtering.
