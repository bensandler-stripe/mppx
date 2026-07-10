import * as Challenge from '../../Challenge.js'
import * as Constants from '../../Constants.js'
import { chainId as tempoChainIds } from '../../tempo/internal/defaults.js'
import * as x402Header from '../../x402/Header.js'
import { pc } from '../utils.js'
import { buildUrl, extractRequestBodyFromDiscovery } from './discovery.js'
import type { CheckResult, EndpointSpec } from './helpers.js'
import {
  check,
  fail,
  fetchWithTimeout,
  isValidAddress,
  isValidIntegerAmount,
  skip,
  warn,
} from './helpers.js'

function detectTestnet(challenge: Challenge.Challenge): boolean {
  const request = challenge.request as Record<string, unknown>
  const methodDetails = request.methodDetails as Record<string, unknown> | undefined
  if (typeof methodDetails?.chainId === 'number') {
    return methodDetails.chainId !== tempoChainIds.mainnet
  }
  return false
}

export async function validateChallenge(
  baseUrl: string,
  endpoint: EndpointSpec,
  verbose: boolean,
  options?: {
    body?: string | undefined
    query?: string[] | undefined
    discoveryDoc?: Record<string, unknown> | undefined
  },
): Promise<{ results: CheckResult[]; resolvedBody?: string | undefined }> {
  const results: CheckResult[] = []
  const url = buildUrl(baseUrl, endpoint, options?.query)
  const fetchHeaders: Record<string, string> = {}
  let fetchBody: string | undefined

  // Make bare unauthenticated request first (no body)
  let response: Response
  try {
    response = await fetchWithTimeout(url, { method: endpoint.method })
  } catch (error) {
    results.push(fail('Request failed', (error as Error).message))
    return { results }
  }

  // If we got 400, retry with body (explicit --body or auto-generated from schema)
  if (response.status === 400) {
    const bodyToTry =
      options?.body ??
      (options?.discoveryDoc
        ? extractRequestBodyFromDiscovery(options.discoveryDoc, endpoint)
        : undefined)
    if (bodyToTry) {
      if (verbose) console.log(pc.dim(`  Retrying with body: ${bodyToTry}`))
      fetchBody = bodyToTry
      fetchHeaders['content-type'] = 'application/json'
      try {
        response = await fetchWithTimeout(url, {
          method: endpoint.method,
          headers: fetchHeaders,
          body: fetchBody,
        })
      } catch (error) {
        results.push(fail('Request failed', (error as Error).message))
        return { results }
      }
    }
  }

  // Check 402
  if (response.status !== 402) {
    if (response.status === 200) {
      results.push(
        skip(
          'Returns 402 without credentials',
          'Got 200 (endpoint may not require payment in all cases)',
        ),
      )
    } else if (response.status === 401 || response.status === 403) {
      results.push(
        skip(
          'Returns 402 without credentials',
          `Got ${response.status} (endpoint requires auth before payment gate)`,
        ),
      )
    } else {
      results.push(
        fail(
          'Returns 402 without credentials',
          `Got ${response.status} instead`,
          response.status === 400
            ? 'Server requires a valid request body before returning 402. Add a requestBody schema with examples to your OpenAPI doc, or use --body.'
            : 'Endpoints that require payment must return HTTP 402 with a WWW-Authenticate: Payment header when no valid credential is provided.',
        ),
      )
    }
    return { results }
  }
  results.push(check('Returns 402 without credentials'))

  // Check WWW-Authenticate header
  const wwwAuth = response.headers.get(Constants.Headers.wwwAuthenticate)
  if (!wwwAuth) {
    const x402Results = checkX402Headers(response)
    if (x402Results.length > 0) {
      results.push(
        skip('Not an MPP endpoint', 'No WWW-Authenticate header — x402 protocol detected'),
      )
      results.push(...x402Results)
    } else {
      results.push(
        skip('Not an MPP endpoint', 'No WWW-Authenticate header (may be x402 or other protocol)'),
      )
    }
    return { results }
  }
  if (!wwwAuth.startsWith(`${Constants.Schemes.payment} `)) {
    results.push(skip('Not an MPP endpoint', `WWW-Authenticate scheme is not Payment`))
    return { results }
  }
  results.push(check('WWW-Authenticate header present', 'Payment scheme'))

  // Parse challenge
  let challenge: Challenge.Challenge
  try {
    challenge = Challenge.fromResponse(response)
  } catch (error) {
    results.push(fail('Challenge parseable', (error as Error).message))
    return { results }
  }
  results.push(check('Challenge parseable', `${challenge.method}/${challenge.intent}`))

  // Validate required fields
  if (!challenge.id)
    results.push(
      fail(
        'Challenge has id',
        undefined,
        'Every challenge must include a unique id field. Generate a random string or hash per challenge.',
      ),
    )
  else results.push(check('Challenge has id'))

  if (!challenge.realm)
    results.push(
      fail(
        'Challenge has realm',
        undefined,
        "Set realm to your server's hostname. It tells clients who they are paying.",
      ),
    )
  else results.push(check('Challenge has realm'))

  if (!challenge.method)
    results.push(
      fail(
        'Challenge has method',
        undefined,
        'Set method to the payment method (e.g. "tempo", "stripe").',
      ),
    )
  if (!challenge.intent)
    results.push(
      fail(
        'Challenge has intent',
        undefined,
        'Set intent to the payment type (e.g. "charge", "session").',
      ),
    )

  // Semantic checks
  if (challenge.expires) {
    const expiresDate = new Date(challenge.expires)
    const now = new Date()
    if (expiresDate <= now) {
      results.push(
        fail(
          'Challenge expires in the future',
          `Expired at ${challenge.expires}`,
          'The expires timestamp must be in the future when the challenge is issued. Use a 5-10 minute window from the current time.',
        ),
      )
    } else {
      const diffMs = expiresDate.getTime() - now.getTime()
      const diffMin = Math.round(diffMs / 60000)
      results.push(check('Challenge expires in the future', `${diffMin}m from now`))
    }
  } else {
    results.push(
      warn(
        'Challenge has expiration',
        'No expires field set',
        'Add an expires field (ISO 8601 datetime) to prevent replay attacks. Recommended: 5 minutes from issuance.',
      ),
    )
  }

  // Realm check (allow subdomain matches)
  try {
    const serverHost = new URL(baseUrl).hostname
    const realm = challenge.realm ?? ''
    const matches = serverHost === realm || serverHost.endsWith(`.${realm}`)
    if (matches) {
      results.push(check('Realm matches server hostname'))
    } else {
      results.push(
        warn(
          'Realm matches server hostname',
          `realm="${realm}" vs host="${serverHost}"`,
          'Set the realm to your production hostname (or base domain) in the challenge. Clients use realm to verify they are paying the right server.',
        ),
      )
    }
  } catch {}

  // Method-specific validation
  const request = challenge.request as Record<string, unknown>
  if (challenge.method === Constants.Methods.tempo) {
    if (isValidAddress(request.recipient)) {
      results.push(check('Valid recipient address'))
    } else {
      results.push(
        fail(
          'Valid recipient address',
          `Got: ${String(request.recipient)}`,
          'Set request.recipient to a valid 0x-prefixed 40-hex-char address. This is where payment will be sent.',
        ),
      )
    }

    if (isValidAddress(request.currency)) {
      const isTestnet = detectTestnet(challenge)
      const network = isTestnet ? 'testnet' : 'mainnet'
      results.push(check('Valid currency address', `${network}`))
    } else {
      results.push(
        fail(
          'Valid currency address',
          `Got: ${String(request.currency)}`,
          'Set request.currency to a valid token address. Common: "0x20c0000000000000000000000000000000000000" (PathUSD).',
        ),
      )
    }

    if (isValidIntegerAmount(request.amount)) {
      results.push(check('Amount is valid integer string'))
    } else if (request.amount === undefined || request.amount === null) {
      results.push(
        warn(
          'Amount is valid integer string',
          'No amount (dynamic pricing?)',
          'Set request.amount to a string of digits in the token\'s smallest unit (e.g. "10000" = $0.01 for 6-decimal tokens).',
        ),
      )
    } else {
      results.push(
        fail(
          'Amount is valid integer string',
          `Got: ${String(request.amount)}`,
          'request.amount must be a string of digits (no decimals, no prefix). Example: "10000" for $0.01 with 6-decimal tokens.',
        ),
      )
    }
  } else if (challenge.method === Constants.Methods.stripe) {
    // Amount
    if (isValidIntegerAmount(request.amount)) {
      results.push(check('Amount is valid integer string'))
    } else if (request.amount === undefined || request.amount === null) {
      results.push(
        warn(
          'Amount is valid integer string',
          'No amount (dynamic pricing?)',
          'Set request.amount to a string of digits in the currency\'s smallest unit (e.g. "100" = $1.00 for USD).',
        ),
      )
    } else {
      results.push(
        fail(
          'Amount is valid integer string',
          `Got: ${String(request.amount)}`,
          'request.amount must be a string of digits (no decimals, no prefix). Example: "100" for $1.00 in USD cents.',
        ),
      )
    }

    // Currency
    const currency = request.currency as string | undefined
    if (currency && /^[a-z]{3}$/i.test(currency)) {
      results.push(check('Valid currency code', currency.toUpperCase()))
    } else if (!currency) {
      results.push(
        fail(
          'Valid currency code',
          'Missing currency',
          'Set request.currency to a three-letter ISO currency code (e.g. "usd").',
        ),
      )
    } else {
      results.push(
        fail(
          'Valid currency code',
          `Got: ${currency}`,
          'request.currency must be a three-letter ISO currency code (e.g. "usd", "eur").',
        ),
      )
    }

    // Decimals
    const decimals = request.decimals as number | undefined
    if (typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0) {
      results.push(check('Has decimals', String(decimals)))
    } else if (decimals === undefined) {
      results.push(
        fail(
          'Has decimals',
          'Missing decimals field',
          'Set request.decimals to the number of decimal places for the currency (e.g. 2 for USD).',
        ),
      )
    } else {
      results.push(
        fail(
          'Has decimals',
          `Got: ${String(decimals)}`,
          'request.decimals must be a non-negative integer.',
        ),
      )
    }

    // networkId
    const methodDetails = request.methodDetails as Record<string, unknown> | undefined
    const networkId = methodDetails?.networkId as string | undefined
    if (networkId) {
      results.push(check('Has networkId', networkId.slice(0, 20)))
    } else {
      results.push(
        fail(
          'Has networkId',
          'Missing methodDetails.networkId',
          'Set methodDetails.networkId to your Stripe Business Network profile ID.',
        ),
      )
    }

    // paymentMethodTypes
    const pmTypes = methodDetails?.paymentMethodTypes as string[] | undefined
    if (Array.isArray(pmTypes) && pmTypes.length > 0) {
      results.push(check('Has paymentMethodTypes', pmTypes.join(', ')))
    } else {
      results.push(
        fail(
          'Has paymentMethodTypes',
          'Missing or empty methodDetails.paymentMethodTypes',
          'Set methodDetails.paymentMethodTypes to an array of accepted payment method types (e.g. ["card"]).',
        ),
      )
    }
  } else if (challenge.method === Constants.Methods.evm) {
    // Recipient
    if (isValidAddress(request.recipient)) {
      results.push(check('Valid recipient address'))
    } else {
      results.push(
        fail(
          'Valid recipient address',
          `Got: ${String(request.recipient)}`,
          'Set request.recipient to a valid 0x-prefixed 40-hex-char Ethereum address.',
        ),
      )
    }

    // Currency (token address)
    if (isValidAddress(request.currency)) {
      results.push(check('Valid currency address'))
    } else {
      results.push(
        fail(
          'Valid currency address',
          `Got: ${String(request.currency)}`,
          'Set request.currency to a valid ERC-20 token contract address.',
        ),
      )
    }

    // Amount
    if (isValidIntegerAmount(request.amount)) {
      results.push(check('Amount is valid integer string'))
    } else if (request.amount === undefined || request.amount === null) {
      results.push(
        warn(
          'Amount is valid integer string',
          'No amount (dynamic pricing?)',
          "Set request.amount to a string of digits in the token's smallest unit.",
        ),
      )
    } else {
      results.push(
        fail(
          'Amount is valid integer string',
          `Got: ${String(request.amount)}`,
          'request.amount must be a string of digits (no decimals, no prefix).',
        ),
      )
    }

    // chainId
    const methodDetails = request.methodDetails as Record<string, unknown> | undefined
    const chainId = methodDetails?.chainId as number | undefined
    if (typeof chainId === 'number' && chainId > 0) {
      results.push(check('Has chainId', String(chainId)))
    } else {
      results.push(
        fail(
          'Has chainId',
          'Missing methodDetails.chainId',
          'Set methodDetails.chainId to the EVM chain ID where payment will be processed.',
        ),
      )
    }
  }

  if (verbose) {
    console.log(pc.dim(`    Challenge: ${JSON.stringify(challenge, null, 2)}`))
  }

  return { results, resolvedBody: fetchBody }
}

export async function validateErrorHandling(
  baseUrl: string,
  endpoint: EndpointSpec,
  options?: { body?: string | undefined; query?: string[] | undefined },
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const url = buildUrl(baseUrl, endpoint, options?.query)
  const fetchHeaders: Record<string, string> = {
    [Constants.Headers.authorization]: `${Constants.Schemes.payment} dGhpcyBpcyBnYXJiYWdl`,
  }
  let fetchBody: string | undefined
  if (options?.body) {
    fetchBody = options.body
    fetchHeaders['content-type'] = 'application/json'
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: endpoint.method,
      headers: fetchHeaders,
      body: fetchBody ?? null,
    })

    if (response.status === 402) {
      results.push(check('Malformed credential returns 402', 'not 500'))
      const wwwAuth = response.headers.get(Constants.Headers.wwwAuthenticate)
      if (wwwAuth?.startsWith(`${Constants.Schemes.payment} `)) {
        results.push(check('Error response includes fresh challenge'))
      } else {
        results.push(
          warn(
            'Error response includes fresh challenge',
            'No WWW-Authenticate header',
            'When rejecting an invalid credential, respond with 402 and include a fresh WWW-Authenticate: Payment challenge so the client can retry.',
          ),
        )
      }
    } else if (response.status >= 500) {
      results.push(
        fail(
          'Malformed credential returns 402',
          `Got ${response.status} (server error)`,
          'When the Authorization header contains an invalid credential, respond with 402 (not 500). Catch credential validation errors and return a fresh challenge.',
        ),
      )
    } else {
      results.push(
        warn(
          'Malformed credential returns 402',
          `Got ${response.status}`,
          `When the Authorization header contains an invalid Payment credential, respond with 402 and a fresh WWW-Authenticate challenge. Returning ${response.status} prevents the client from retrying with a valid payment.`,
        ),
      )
    }
  } catch (error) {
    results.push(fail('Error handling test', (error as Error).message))
  }

  return results
}

function checkX402Headers(response: Response): CheckResult[] {
  const results: CheckResult[] = []
  const paymentRequiredRaw =
    response.headers.get('payment-required') ?? response.headers.get('x-payment-required')
  if (!paymentRequiredRaw) return results

  const headerName = response.headers.get('payment-required')
    ? 'PAYMENT-REQUIRED'
    : 'X-Payment-Required'

  try {
    const decoded = x402Header.decodePaymentRequired(paymentRequiredRaw)
    results.push(
      check(
        'x402 payment challenge',
        `${headerName} with valid x402 v${decoded.x402Version} payload`,
      ),
    )
  } catch {
    results.push(
      warn(
        'x402 payment challenge',
        `${headerName} header present but failed schema validation`,
        'Ensure the PAYMENT-REQUIRED header contains a valid base64-encoded JSON payload matching the x402 schema.',
      ),
    )
  }
  return results
}
