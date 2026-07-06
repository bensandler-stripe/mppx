import { Cli, z } from 'incur'

import { validate as validateCore } from '../../validate/core.js'
import { pc } from '../utils.js'
import type { Counts } from './helpers.js'
import { printResults, printSection } from './helpers.js'

const validate = Cli.create('validate', {
  description: 'Validate an MPP server implementation end-to-end',
  args: z.object({
    url: z.string().describe('Base URL of the MPP server to validate'),
  }),
  options: z.object({
    endpoint: z.string().optional().describe('Endpoint to test (METHOD:path). Skips discovery.'),
    body: z
      .string()
      .optional()
      .describe(
        'Request body. With --endpoint, used directly. In discovery mode, JSON with / keys is a per-path mapping.',
      ),
    query: z.array(z.string()).optional().describe('Query parameter (key=value, repeatable)'),
    verbose: z.number().default(0).meta({ count: true }).describe('Verbosity level'),
    yes: z.boolean().default(false).describe('Auto-approve mainnet payments'),
    outputJson: z.boolean().default(false).describe('Output results as JSON'),
  }),
  alias: {
    endpoint: 'e',
    verbose: 'v',
    yes: 'y',
    outputJson: 'j',
  },
  async run(c) {
    const result = await validateCore({
      url: c.args.url,
      endpoint: c.options.endpoint,
      body: c.options.body,
      query: c.options.query,
      verbose: c.options.verbose > 0,
      yes: c.options.yes,
    })

    if (c.options.outputJson) {
      console.log(JSON.stringify(result, null, 2))
      const noEndpoints = result.endpoints.length === 0 && !c.options.endpoint
      if (result.summary.failed > 0 || !result.discovery.found || noEndpoints) process.exit(1)
      return
    }

    // Human-readable output
    console.log(`\n${pc.bold('mppx validate')} ${pc.dim(result.url)}\n`)

    // Discovery
    printSection('Discovery (/openapi.json)')
    const counts: Counts = { passed: 0, failed: 0, warnings: 0, skipped: 0 }
    printResults(result.discovery.checks, counts)

    if (!result.discovery.found && !c.options.endpoint) {
      console.log('')
      console.log(pc.yellow('  No discovery document found.'))
      console.log(
        pc.dim(
          '  MPP servers must serve an OpenAPI document at /openapi.json with x-payment-info extensions.',
        ),
      )
      console.log(
        pc.dim('  To test a specific endpoint: mppx validate <url> --endpoint POST:/your/path'),
      )
      console.log('')
      process.exit(1)
    }

    if (result.discovery.endpoints.length === 0 && !c.options.endpoint && result.discovery.found) {
      console.log(pc.dim('  Use --endpoint to specify endpoints manually.'))
      console.log('')
      process.exit(1)
    }

    // Endpoints
    for (const ep of result.endpoints) {
      printSection(`${ep.method} ${ep.path}`)

      if (ep.challenge.length > 0) {
        console.log(pc.dim('  Challenge'))
        printResults(ep.challenge, counts)
      }

      if (ep.errorHandling.length > 0) {
        console.log(pc.dim('  Error Handling'))
        printResults(ep.errorHandling, counts)
      }

      if (ep.payment.length > 0) {
        console.log(pc.dim('  Payment'))
        printResults(ep.payment, counts)
      }
    }

    // Summary
    printSummary(counts, result.flags, result.endpoints.length)
  },
})

export default validate

function printSummary(
  counts: Counts,
  flags: {
    sawMppEndpoint: boolean
    sawNonMppPaymentEndpoint: boolean
    sawTestnet: boolean
    sawMainnet: boolean
    paymentSucceeded: boolean
  },
  endpointsLength: number,
): void {
  if (!flags.sawMppEndpoint && endpointsLength > 0) {
    console.log('')
    if (flags.sawNonMppPaymentEndpoint) {
      console.log(
        pc.yellow(
          `  No MPP endpoints found. Tested ${endpointsLength} endpoint(s) but none use WWW-Authenticate: Payment.`,
        ),
      )
      console.log(pc.dim('  This server may use x402 or another payment protocol.'))
    } else if (counts.skipped > 0 && counts.failed === 0) {
      console.log(
        pc.yellow(`  Could not reach payment gate on any endpoint (all returned 401/403/200).`),
      )
      console.log(
        pc.dim(
          '  The server may require authentication before payment. Try providing auth or use --endpoint with a public path.',
        ),
      )
    } else {
      console.log(
        pc.yellow(
          `  No MPP endpoints found. Tested ${endpointsLength} endpoint(s) but none use WWW-Authenticate: Payment.`,
        ),
      )
      console.log(pc.dim('  This server may use x402 or another payment protocol.'))
    }
    console.log('')
    process.exit(1)
  }

  console.log('')
  const parts: string[] = []
  if (counts.passed > 0) parts.push(pc.green(`${counts.passed} passed`))
  if (counts.failed > 0) parts.push(pc.red(`${counts.failed} failed`))
  if (counts.warnings > 0) parts.push(pc.yellow(`${counts.warnings} warning(s)`))
  if (counts.skipped > 0) parts.push(pc.yellow(`${counts.skipped} skipped`))
  console.log(`${pc.bold('Summary:')} ${parts.join(', ')}`)

  if (flags.paymentSucceeded && flags.sawTestnet && !flags.sawMainnet) {
    console.log('')
    console.log(
      pc.dim('  Tip: validate your mainnet server too to confirm real payments work end-to-end.'),
    )
  } else if (flags.sawMainnet && !flags.sawTestnet) {
    console.log('')
    console.log(
      pc.dim(
        '  Tip: validate a testnet server too for free. This CLI automatically provisions and funds a testnet wallet for testing.',
      ),
    )
  }

  console.log('')

  if (counts.failed > 0) process.exit(1)
}
