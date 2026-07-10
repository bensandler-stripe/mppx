import { validateChallenge, validateErrorHandling } from '../cli/validate/challenge.js'
import {
  buildUrl,
  extractEndpointsFromDiscovery,
  extractRequestBodyFromDiscovery,
  fetchDiscoveryDoc,
} from '../cli/validate/discovery.js'
import type { CheckResult, EndpointSpec, PathParameter } from '../cli/validate/helpers.js'
import {
  isValidIntegerAmount,
  parseEndpointArg,
  resolveBodyForEndpoint,
} from '../cli/validate/helpers.js'
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
  onPaymentResults?: (results: CheckResult[]) => void
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
    sawMalformedChallenge: boolean
    sawTestnet: boolean
    sawMainnet: boolean
    paymentSucceeded: boolean
  }
}

export type ValidateEvent =
  | { phase: 'discovery'; discovery: DiscoveryResult; results: CheckResult[] }
  | { phase: 'endpoint'; endpoint: EndpointSpec }
  | {
      phase: 'challenge'
      endpoint: EndpointSpec
      results: CheckResult[]
      isMpp: boolean
      isTestnet: boolean
      isNonMppPayment: boolean
      isMalformedChallenge: boolean
    }
  | { phase: 'errorHandling'; endpoint: EndpointSpec; results: CheckResult[] }
  | {
      phase: 'payment'
      endpoint: EndpointSpec
      results: CheckResult[]
      succeeded: boolean
      body?: string | undefined
    }

/** Streams validation results as each phase completes. */
export async function* validateStream(options: ValidateOptions): AsyncGenerator<ValidateEvent> {
  const baseUrl = options.url.replace(/\/$/, '').replace(/\/openapi\.json$/i, '')
  const verbose = options.verbose ?? false

  const discovery = await runDiscovery(baseUrl, options)
  yield { phase: 'discovery', discovery, results: discovery.checks }

  for (const endpoint of discovery.endpoints) {
    yield { phase: 'endpoint', endpoint }

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
    const isMpp = challengeResults.some(
      (r) => r.severity === 'pass' && r.label === 'Challenge parseable',
    )
    const isTestnet = challengeResults.some(
      (r) =>
        r.severity === 'pass' &&
        r.label.endsWith('Valid currency address') &&
        r.detail === 'testnet',
    )
    const isNonMppPayment =
      !isMpp && challengeResults.some((r) => r.label === 'Not an MPP endpoint')
    const hasPaymentScheme = challengeResults.some(
      (r) => r.severity === 'pass' && r.label === 'WWW-Authenticate header present',
    )
    const challengeFailed = challengeResults.some(
      (r) => r.severity === 'fail' && r.label === 'Challenge parseable',
    )
    const isMalformedChallenge = !isMpp && hasPaymentScheme && challengeFailed

    yield {
      phase: 'challenge',
      endpoint,
      results: challengeResults,
      isMpp,
      isTestnet,
      isNonMppPayment,
      isMalformedChallenge,
    }

    if (isMpp) {
      const errorResults = await validateErrorHandling(baseUrl, endpoint, {
        body: effectiveBody,
        query: options.query,
      })
      yield { phase: 'errorHandling', endpoint, results: errorResults }

      if (!options.skipPayment) {
        const paymentResults = await validatePaymentFlow(baseUrl, endpoint, verbose, {
          body: effectiveBody,
          query: options.query,
          yes: options.yes,
          onResults: options.onPaymentResults,
        })
        const succeeded = paymentResults.some(
          (r) => r.severity === 'pass' && r.label === 'Payment: successful',
        )
        yield { phase: 'payment', endpoint, results: paymentResults, succeeded }
      }
    }
  }
}

/** Runs the full validation suite and returns all results as a batch. */
export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const baseUrl = options.url.replace(/\/$/, '').replace(/\/openapi\.json$/i, '')
  let discovery: DiscoveryResult | undefined
  const endpointResults: EndpointValidationResult[] = []
  let current: EndpointValidationResult | undefined

  let sawTestnet = false
  let sawMainnet = false
  let paymentSucceeded = false
  let sawMppEndpoint = false
  let sawNonMppPaymentEndpoint = false
  let sawMalformedChallenge = false

  for await (const event of validateStream(options)) {
    switch (event.phase) {
      case 'discovery':
        discovery = event.discovery
        break
      case 'endpoint':
        current = {
          method: event.endpoint.method,
          path: event.endpoint.path,
          challenge: [],
          errorHandling: [],
          payment: [],
        }
        endpointResults.push(current)
        break
      case 'challenge':
        if (current) current.challenge = event.results
        if (event.isMpp) {
          sawMppEndpoint = true
          if (event.isTestnet) sawTestnet = true
          else sawMainnet = true
        }
        if (event.isNonMppPayment) sawNonMppPaymentEndpoint = true
        if (event.isMalformedChallenge) sawMalformedChallenge = true
        break
      case 'errorHandling':
        if (current) current.errorHandling = event.results
        break
      case 'payment':
        if (current) current.payment = event.results
        if (event.succeeded) paymentSucceeded = true
        break
    }
  }

  const summary = { passed: 0, failed: 0, warnings: 0, skipped: 0 }
  if (discovery) {
    for (const r of discovery.checks) {
      if (r.severity === 'pass') summary.passed++
      else if (r.severity === 'fail') summary.failed++
      else if (r.severity === 'warn') summary.warnings++
      else if (r.severity === 'skip') summary.skipped++
    }
  }
  for (const ep of endpointResults) {
    for (const r of [...ep.challenge, ...ep.errorHandling, ...ep.payment]) {
      if (r.severity === 'pass') summary.passed++
      else if (r.severity === 'fail') summary.failed++
      else if (r.severity === 'warn') summary.warnings++
      else if (r.severity === 'skip') summary.skipped++
    }
  }

  if (!discovery) throw new Error('Discovery phase did not complete')

  return {
    url: baseUrl,
    discovery,
    endpoints: endpointResults,
    summary,
    flags: {
      sawMppEndpoint,
      sawNonMppPaymentEndpoint,
      sawMalformedChallenge,
      sawTestnet,
      sawMainnet,
      paymentSucceeded,
    },
  }
}

async function runDiscovery(baseUrl: string, options: ValidateOptions): Promise<DiscoveryResult> {
  const checks: CheckResult[] = []
  let endpoints: EndpointSpec[] = []
  let discoveryDoc: Record<string, unknown> | null = null
  let found = false
  let valid = false

  // Try the user's path first, then root, then /api.
  const origin = new URL(baseUrl).origin
  let candidates: string[]
  if (options.discoveryPath) {
    candidates = [
      new URL(options.discoveryPath, baseUrl + '/').href.replace(/\/openapi\.json$/i, ''),
    ]
  } else {
    candidates = [baseUrl, origin, `${origin}/api`]
    candidates = [...new Set(candidates)]
  }
  let discoveryResult: Awaited<ReturnType<typeof fetchDiscoveryDoc>> | undefined
  const attemptedErrors: string[] = []
  for (const candidate of candidates) {
    discoveryResult = await fetchDiscoveryDoc(candidate)
    if ('error' in discoveryResult) {
      attemptedErrors.push(`${candidate}/openapi.json: ${discoveryResult.error}`)
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
      for (const e of errors) {
        checks.push({ label: e.message, detail: e.path, severity: 'fail' })
      }
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
      const aAmt = isValidIntegerAmount(a.amount) ? BigInt(a.amount!) : NO_AMOUNT
      const bAmt = isValidIntegerAmount(b.amount) ? BigInt(b.amount!) : NO_AMOUNT
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
