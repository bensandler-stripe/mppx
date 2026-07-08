import { validateChallenge, validateErrorHandling } from '../cli/validate/challenge.js'
import {
  buildUrl,
  extractEndpointsFromDiscovery,
  extractRequestBodyFromDiscovery,
  fetchDiscoveryDoc,
} from '../cli/validate/discovery.js'
import type { CheckResult, EndpointSpec, PathParameter } from '../cli/validate/helpers.js'
import { parseEndpointArg, resolveBodyForEndpoint } from '../cli/validate/helpers.js'
import { validatePaymentFlow } from '../cli/validate/payment.js'
import { validate as validateDiscoveryDoc } from '../discovery/Validate.js'

export { buildUrl }
export type { CheckResult, EndpointSpec, PathParameter }

export type ValidateOptions = {
  url: string
  endpoint?: string | undefined
  body?: string | undefined
  query?: string[] | undefined
  verbose?: boolean | undefined
  yes?: boolean | undefined
  skipPayment?: boolean | undefined
  discoveryPath?: string | undefined
}

export type DiscoveryResult = {
  found: boolean
  valid: boolean
  endpoints: EndpointSpec[]
  checks: CheckResult[]
  doc: Record<string, unknown> | null
}

export type EndpointValidationResult = {
  method: string
  path: string
  challenge: CheckResult[]
  errorHandling: CheckResult[]
  payment: CheckResult[]
}

export type ValidateResult = {
  url: string
  discovery: DiscoveryResult
  endpoints: EndpointValidationResult[]
  summary: { passed: number; failed: number; warnings: number; skipped: number }
  flags: {
    sawMppEndpoint: boolean
    sawNonMppPaymentEndpoint: boolean
    sawTestnet: boolean
    sawMainnet: boolean
    paymentSucceeded: boolean
  }
}

/** Runs the full MPP validation suite against a server: discovery, challenge parsing, error handling, and (optionally) payment flow. */
export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const baseUrl = options.url.replace(/\/$/, '').replace(/\/openapi\.json$/i, '')
  const verbose = options.verbose ?? false

  const discovery = await runDiscovery(baseUrl, options)
  const endpointResults: EndpointValidationResult[] = []

  let sawTestnet = false
  let sawMainnet = false
  let paymentSucceeded = false
  let sawMppEndpoint = false
  let sawNonMppPaymentEndpoint = false

  for (const endpoint of discovery.endpoints) {
    let body: string | undefined
    if (options.endpoint) {
      body = options.body
    } else {
      body = resolveBodyForEndpoint(options.body, endpoint.path)
      if (!body && discovery.doc) {
        body = extractRequestBodyFromDiscovery(discovery.doc, endpoint)
      }
    }

    const { results: challengeResults, resolvedBody } = await validateChallenge(
      baseUrl,
      endpoint,
      verbose,
      {
        body,
        query: options.query,
        discoveryDoc: discovery.doc ?? undefined,
      },
    )
    const effectiveBody = resolvedBody ?? body

    const isMppEndpoint = challengeResults.some(
      (r) => r.severity === 'pass' && r.label === 'Challenge parseable',
    )

    let errorResults: CheckResult[] = []
    let paymentResults: CheckResult[] = []

    if (isMppEndpoint) {
      sawMppEndpoint = true

      const isTestnetEndpoint = challengeResults.some(
        (r) =>
          r.severity === 'pass' && r.label === 'Valid currency address' && r.detail === 'testnet',
      )
      if (isTestnetEndpoint) sawTestnet = true
      else sawMainnet = true

      errorResults = await validateErrorHandling(baseUrl, endpoint, {
        body: effectiveBody,
        query: options.query,
      })

      if (!options.skipPayment) {
        paymentResults = await validatePaymentFlow(baseUrl, endpoint, verbose, {
          body: effectiveBody,
          query: options.query,
          yes: options.yes,
        })
        if (
          paymentResults.some((r) => r.severity === 'pass' && r.label === 'Payment: successful')
        ) {
          paymentSucceeded = true
        }
      }
    } else {
      if (challengeResults.some((r) => r.label === 'Not an MPP endpoint'))
        sawNonMppPaymentEndpoint = true
    }

    endpointResults.push({
      method: endpoint.method,
      path: endpoint.path,
      challenge: challengeResults,
      errorHandling: errorResults,
      payment: paymentResults,
    })
  }

  const summary = { passed: 0, failed: 0, warnings: 0, skipped: 0 }
  for (const ep of endpointResults) {
    for (const r of [...ep.challenge, ...ep.errorHandling, ...ep.payment]) {
      if (r.severity === 'pass') summary.passed++
      else if (r.severity === 'fail') summary.failed++
      else if (r.severity === 'warn') summary.warnings++
      else if (r.severity === 'skip') summary.skipped++
    }
  }
  for (const r of discovery.checks) {
    if (r.severity === 'pass') summary.passed++
    else if (r.severity === 'fail') summary.failed++
    else if (r.severity === 'warn') summary.warnings++
    else if (r.severity === 'skip') summary.skipped++
  }

  return {
    url: baseUrl,
    discovery,
    endpoints: endpointResults,
    summary,
    flags: { sawMppEndpoint, sawNonMppPaymentEndpoint, sawTestnet, sawMainnet, paymentSucceeded },
  }
}

async function runDiscovery(baseUrl: string, options: ValidateOptions): Promise<DiscoveryResult> {
  const checks: CheckResult[] = []
  let endpoints: EndpointSpec[] = []
  let discoveryDoc: Record<string, unknown> | null = null
  let found = false
  let valid = false

  const candidates = options.discoveryPath
    ? [options.discoveryPath]
    : ['/openapi.json', '/api/openapi.json']
  let discoveryResult: Awaited<ReturnType<typeof fetchDiscoveryDoc>> | undefined
  const attemptedErrors: string[] = []
  for (const path of candidates) {
    const candidateUrl = new URL(path, baseUrl).href.replace(/\/$/, '')
    const baseForCandidate = candidateUrl.replace(/\/openapi\.json$/i, '')
    discoveryResult = await fetchDiscoveryDoc(baseForCandidate)
    if ('error' in discoveryResult) {
      attemptedErrors.push(`${path}: ${discoveryResult.error}`)
    } else {
      break
    }
  }

  if (!discoveryResult || 'error' in discoveryResult) {
    checks.push({
      label: 'Document found',
      detail: attemptedErrors.join('; '),
      hint: 'MPP servers must serve an OpenAPI document at /openapi.json with x-payment-info extensions.',
      severity: 'fail',
    })
  } else {
    found = true
    checks.push({ label: 'Document found and parseable', severity: 'pass' })

    const issues = validateDiscoveryDoc(discoveryResult.doc)
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')

    if (errors.length > 0) {
      checks.push({
        label: 'Valid OpenAPI structure',
        detail: `${errors.length} error(s)`,
        severity: 'fail',
      })
    } else {
      valid = true
      checks.push({ label: 'Valid OpenAPI structure', severity: 'pass' })
    }

    for (const w of warnings) {
      checks.push({ label: w.message, detail: w.path, severity: 'warn' })
    }

    discoveryDoc = discoveryResult.doc as Record<string, unknown>
  }

  if (options.endpoint) {
    const parsed = parseEndpointArg(options.endpoint)
    if (parsed) endpoints.push(parsed)
  } else if (discoveryDoc) {
    endpoints = extractEndpointsFromDiscovery(discoveryDoc)

    const NO_AMOUNT = BigInt('999999999999999999')
    endpoints.sort((a, b) => {
      const aAmt = a.amount ? BigInt(a.amount) : NO_AMOUNT
      const bAmt = b.amount ? BigInt(b.amount) : NO_AMOUNT
      return aAmt < bAmt ? -1 : aAmt > bAmt ? 1 : 0
    })

    if (endpoints.length > 0) {
      checks.push({
        label: 'Paid endpoints found',
        detail: `${endpoints.length} endpoint(s)`,
        severity: 'pass',
      })
    } else {
      checks.push({
        label: 'Paid endpoints found',
        detail: 'No endpoints with x-payment-info',
        severity: 'warn',
      })
    }
  }

  return { found, valid, endpoints, checks, doc: discoveryDoc }
}
