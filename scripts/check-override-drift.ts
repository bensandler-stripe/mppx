#!/usr/bin/env tsx
// Validates that package.json dependency versions don't conflict with
// pnpm-workspace.yaml overrides. If a workspace override pins a package
// to a specific version, the matching entry in package.json must declare
// the same version — otherwise the declared version is misleading since
// pnpm will always resolve to the override.
//
// This catches dependabot PRs that bump overridden packages, since
// dependabot does not read pnpm workspace overrides.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const workspaceRaw = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')

// Minimal YAML parser for the overrides map (avoids adding a dependency).
// Handles lines like:   package-name: '1.2.3'
//                       '@scoped/pkg': "1.2.3"
//                       package-name: 1.2.3  # with optional comment
function parseOverrides(yaml: string): Record<string, string> {
  const overrides: Record<string, string> = {}
  let inOverrides = false
  for (const line of yaml.split('\n')) {
    if (/^overrides:\s*$/.test(line)) {
      inOverrides = true
      continue
    }
    if (inOverrides) {
      if (/^\S/.test(line)) break // new top-level key
      const m = line.match(/^\s+['"]?([\w@/._^<>=! -]+)['"]?:\s*['"]?([^'"#]+)['"]?\s*(?:#.*)?$/)
      if (m) overrides[m[1].trim()] = m[2].trim()
    }
  }
  return overrides
}

interface Mismatch {
  name: string
  pkgVersion: string
  overrideVersion: string
}

const overrides = parseOverrides(workspaceRaw)
// Only check dependencies and devDependencies. peerDependencies express
// consumer compatibility ranges and are not resolved locally.
const allDeps: Record<string, string> = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
}

const mismatches: Mismatch[] = []
for (const [name, pkgVersion] of Object.entries(allDeps)) {
  // Only check simple overrides (no range selectors like "pkg@<2.0.0")
  if (!(name in overrides)) continue
  const overrideVersion = overrides[name]
  // Skip non-version overrides (workspace:*, npm:..., https://...)
  if (/^(workspace:|npm:|https?:)/.test(overrideVersion)) continue
  // Normalize: strip leading ^ and ~ for comparison
  const cleanPkg = pkgVersion.replace(/^[~^]/, '')
  const cleanOverride = overrideVersion.replace(/^[~^]/, '')
  if (cleanPkg !== cleanOverride) {
    mismatches.push({ name, pkgVersion, overrideVersion })
  }
}

if (mismatches.length > 0) {
  console.error(
    'package.json declares versions that conflict with pnpm-workspace.yaml overrides:\n',
  )
  for (const { name, pkgVersion, overrideVersion } of mismatches) {
    console.error(`  ${name}`)
    console.error(`    package.json:          ${pkgVersion}`)
    console.error(`    workspace override:    ${overrideVersion}`)
    console.error()
  }
  console.error('The workspace override wins at install time, making package.json misleading.')
  console.error(
    'Either update package.json to match the override, or remove/update the override.\n',
  )
  process.exit(1)
}

console.log('✓ All package.json versions are consistent with workspace overrides')
