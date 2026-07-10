import { type Address, type Chain, createClient, erc20Abi, http } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { readContract, waitForTransactionReceipt } from 'viem/actions'
import * as viemChains from 'viem/chains'
import { Actions } from 'viem/tempo'
import { tempoModerato, tempo as tempoMainnetChain } from 'viem/tempo/chains'

import * as Challenge from '../../Challenge.js'
import * as Mppx from '../../client/Mppx.js'
import * as Constants from '../../Constants.js'
import { evm as evmMethods } from '../../evm/client/index.js'
import * as Receipt from '../../Receipt.js'
import { tempo as tempoMethods } from '../../tempo/client/index.js'
import { chainId as tempoChainIds } from '../../tempo/internal/defaults.js'
import { resolveAccount, resolveAccountName } from '../account.js'
import { loadConfig, resolvePlugin } from '../internal.js'
import { fetchTokenInfo, confirm, pc } from '../utils.js'
import { buildUrl } from './discovery.js'
import type { CheckResult, EndpointSpec } from './helpers.js'
import {
  check,
  fail,
  fetchWithTimeout,
  formatBytes,
  isValidIntegerAmount,
  skip,
  warn,
} from './helpers.js'

async function provisionAndPayTestnet(
  challenge: Challenge.Challenge,
  verbose: boolean,
): Promise<{ methods: import('../../Method.js').AnyClient[] } | undefined> {
  try {
    console.log(pc.dim('    Provisioning testnet wallet and funding via faucet...'))
    const key = generatePrivateKey()
    const account = privateKeyToAccount(key)

    const client = createClient({ chain: tempoModerato, transport: http() })
    const hashes = await Actions.faucet.fund(client, { account })
    await Promise.all(hashes.map((hash) => waitForTransactionReceipt(client, { hash })))
    console.log(pc.dim(`    Using wallet: ${account.address}`))

    const methods = [...tempoMethods({ account })]
    return { methods }
  } catch (error) {
    if (verbose) console.log(pc.dim(`    Provisioning failed: ${(error as Error).message}`))
    return undefined
  }
}

async function resolveWalletAddress(): Promise<string | undefined> {
  const accountName = resolveAccountName()
  const { isTempoAccount } = await import('../utils.js')
  const { resolveTempoAccount } = await import('../plugins/tempo.js')
  if (isTempoAccount(accountName)) {
    const entry = resolveTempoAccount(accountName)
    if (entry) return entry.wallet_address
  }
  try {
    const account = await resolveAccount()
    return account.address
  } catch {
    return undefined
  }
}

async function fetchEvmTokenInfo(
  chain: Chain,
  token: Address,
  account: Address,
): Promise<{ balance: bigint; symbol: string | undefined }> {
  const client = createClient({ chain, transport: http() })
  const [balance, symbol] = await Promise.all([
    readContract(client, {
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    }),
    readContract(client, { address: token, abi: erc20Abi, functionName: 'symbol' }).catch(
      () => undefined,
    ),
  ])
  return { balance, symbol: symbol ?? undefined }
}

async function resolveEvmMethods(): Promise<import('../../Method.js').AnyClient[]> {
  const account = await resolveAccount()
  // Known assets provide EIP-712 domain metadata (token name/version) needed for EIP-3009 signing
  const { assets } = await import('../../evm/client/index.js')
  const knownCurrencies = [
    ...Object.values(assets.base),
    ...Object.values(assets.baseSepolia),
    ...Object.values(assets.celo),
    ...Object.values(assets.celoSepolia),
  ]
  return [...evmMethods({ account, currencies: knownCurrencies })]
}

function resolveEvmChain(chainId: number): Chain | undefined {
  const all = Object.values(viemChains) as Chain[]
  return all.find((c) => c.id === chainId)
}

function methodSetupHint(challenge: Challenge.Challenge): string {
  switch (challenge.method) {
    case Constants.Methods.evm:
      return 'no EVM payment plugin yet'
    case 'solana':
      return 'no Solana payment plugin yet'
    default:
      return `no plugin for ${challenge.method}/${challenge.intent}`
  }
}

export async function validatePaymentFlow(
  baseUrl: string,
  endpoint: EndpointSpec,
  verbose: boolean,
  options?: {
    body?: string | undefined
    query?: string[] | undefined
    yes?: boolean | undefined
    onResults?: (results: CheckResult[]) => void
  },
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const url = buildUrl(baseUrl, endpoint, options?.query)
  const fetchHeaders: Record<string, string> = {}
  let fetchBody: string | undefined
  if (options?.body) {
    fetchBody = options.body
    fetchHeaders['content-type'] = 'application/json'
  }

  // Get a fresh challenge
  let challengeResponse: Response
  try {
    challengeResponse = await fetchWithTimeout(url, {
      method: endpoint.method,
      headers: fetchHeaders,
      body: fetchBody ?? null,
    })
  } catch (error) {
    results.push(fail('Payment: fetch challenge', (error as Error).message))
    return results
  }

  if (challengeResponse.status !== 402) {
    results.push(skip('Payment: skipped', `Endpoint returned ${challengeResponse.status}`))
    return results
  }

  // Parse all challenges
  let challenges: Challenge.Challenge[]
  try {
    challenges = Challenge.fromResponseList(challengeResponse)
  } catch (error) {
    results.push(fail('Payment: parse challenge', (error as Error).message))
    return results
  }
  if (challenges.length === 0) {
    results.push(fail('Payment: parse challenge', 'No Payment challenges in response'))
    return results
  }

  // Testnet Tempo: always use ephemeral wallet (zero-setup, free money)
  const tempoTestnetChallenge = challenges.find((ch) => {
    if (ch.method !== Constants.Methods.tempo) return false
    const req = ch.request as Record<string, unknown>
    const md = req.methodDetails as Record<string, unknown> | undefined
    return typeof md?.chainId === 'number' && md.chainId !== tempoChainIds.mainnet
  })

  if (tempoTestnetChallenge) {
    const provisioned = await provisionAndPayTestnet(tempoTestnetChallenge, verbose)
    if (provisioned) {
      const fakeResp = new Response(null, {
        status: 402,
        headers: {
          [Constants.Headers.wwwAuthenticate]: Challenge.serialize(tempoTestnetChallenge),
        },
      })
      try {
        const mppx = Mppx.create({ methods: provisioned.methods, polyfill: false })
        const cred = await mppx.createCredential(fakeResp)
        results.push(check('Payment: submitted', 'ephemeral testnet wallet'))
        return await sendAndValidateResponse(
          results,
          url,
          endpoint,
          cred,
          fetchHeaders,
          fetchBody,
          verbose,
          tempoModerato,
        )
      } catch (error) {
        results.push(fail('Payment: create credential', (error as Error).message))
        return results
      }
    } else {
      results.push(
        fail('Payment: auto-provision wallet', 'Failed to create and fund testnet wallet'),
      )
      return results
    }
  }

  // Try each challenge method (skip testnet challenge already handled above)
  const loaded = await loadConfig().catch(() => undefined)
  const isInteractive = process.stdin.isTTY ?? false
  const supportedPaymentMethods: Set<string> = new Set([
    Constants.Methods.tempo,
    Constants.Methods.evm,
  ])

  for (const challenge of challenges) {
    if (challenge === tempoTestnetChallenge) continue
    if (!supportedPaymentMethods.has(challenge.method)) continue

    const flushStart = results.length
    const flush = () => {
      if (options?.onResults && results.length > flushStart)
        options.onResults(results.slice(flushStart))
    }
    const tag = `Payment [${challenge.method}]`

    try {
      const request = challenge.request as Record<string, unknown>
      const requiredAmount = isValidIntegerAmount(request.amount)
        ? BigInt(request.amount as string)
        : undefined
      const methodDetails = request.methodDetails as Record<string, unknown> | undefined
      const decimals =
        (methodDetails?.decimals as number | undefined) ??
        (request.decimals as number | undefined) ??
        6
      const currency = request.currency as string | undefined

      // Resolve wallet
      let walletAddress: string | undefined
      try {
        walletAddress = await resolveWalletAddress()
      } catch {}

      if (!walletAddress) {
        results.push(skip(tag, 'no wallet configured. Run "mppx account create" to create one.'))
        continue
      }

      // Pre-flight balance check and chain resolution
      let insufficientBalance = false
      let tokenSymbol: string | undefined
      let paymentChain: Chain | undefined
      if (challenge.method === Constants.Methods.tempo) {
        paymentChain = tempoMainnetChain
      } else if (challenge.method === Constants.Methods.evm) {
        const chainId = methodDetails?.chainId as number | undefined
        if (chainId) paymentChain = resolveEvmChain(chainId)
      }

      if (requiredAmount && currency && paymentChain) {
        try {
          let balance: bigint
          if (challenge.method === Constants.Methods.tempo) {
            const client = createClient({ chain: tempoMainnetChain, transport: http() })
            const info = await fetchTokenInfo(client, currency as Address, walletAddress as Address)
            balance = info.balance
            tokenSymbol = info.symbol
          } else {
            const info = await fetchEvmTokenInfo(
              paymentChain,
              currency as Address,
              walletAddress as Address,
            )
            balance = info.balance
            tokenSymbol = info.symbol
          }
          if (balance < requiredAmount) {
            const requiredDisplay = `$${(Number(requiredAmount) / 10 ** decimals).toFixed(2)}`
            const balanceDisplay = `$${(Number(balance) / 10 ** decimals).toFixed(2)}`
            const symbol = tokenSymbol ?? 'tokens'
            results.push(
              skip(
                tag,
                `insufficient balance (have ${balanceDisplay}, need ${requiredDisplay} ${symbol} on ${paymentChain.name})`,
                `Fund wallet ${walletAddress} with at least ${requiredDisplay} ${symbol} on ${paymentChain.name}.`,
              ),
            )
            insufficientBalance = true
          }
        } catch (e) {
          if (verbose) console.log(pc.dim(`    Balance check skipped: ${(e as Error).message}`))
        }
      }
      if (insufficientBalance) continue

      // Prompt
      const amountDisplay = requiredAmount
        ? `$${(Number(requiredAmount) / 10 ** decimals).toFixed(2)}`
        : 'unknown amount'
      const tokenDisplay = tokenSymbol ?? (currency?.length === 3 ? currency.toUpperCase() : '')
      const chainName = paymentChain?.name

      if (walletAddress) console.log(pc.dim(`    Using wallet: ${walletAddress}`))

      if (paymentChain?.testnet) {
        console.log(
          pc.dim(
            `    Auto-approved: ${amountDisplay}${tokenDisplay ? ` ${tokenDisplay}` : ''}${chainName ? ` on ${chainName}` : ''} (testnet)`,
          ),
        )
      } else if (!options?.yes && !isInteractive) {
        results.push(skip(tag, 'non-interactive mode, use --yes to approve'))
        continue
      } else if (!options?.yes) {
        console.log('')
        const ok = await confirm(
          `  ${pc.yellow('Pay')} ${amountDisplay}${tokenDisplay ? ` ${tokenDisplay}` : ''}${chainName ? ` on ${chainName}` : ''}. Continue?`,
          false,
        )
        if (!ok) {
          results.push(skip(tag, 'declined'))
          continue
        }
      } else {
        console.log(
          pc.dim(
            `    Auto-approved: ${amountDisplay}${tokenDisplay ? ` ${tokenDisplay}` : ''}${chainName ? ` on ${chainName}` : ''}`,
          ),
        )
      }

      // Resolve payment methods
      let methods: import('../../Method.js').AnyClient[]
      let createCredentialFn: ((response: Response) => Promise<string>) | undefined
      let plugin: import('../plugins/plugin.js').Plugin | undefined

      if (challenge.method === Constants.Methods.evm) {
        try {
          methods = await resolveEvmMethods()
        } catch (error) {
          results.push(skip(tag, (error as Error).message))
          continue
        }
      } else {
        const resolved = resolvePlugin(challenge, loaded?.config)
        plugin = resolved.plugin
        const directMethod = resolved.method
        if (!plugin && !directMethod) {
          results.push(skip(tag, methodSetupHint(challenge)))
          continue
        }
        if (plugin) {
          try {
            const pluginResult = await plugin.setup({
              challenge,
              options: { network: 'mainnet' },
              methodOpts: {},
            })
            methods = pluginResult.methods
            createCredentialFn = pluginResult.createCredential
          } catch (error) {
            results.push(skip(tag, (error as Error).message))
            continue
          }
        } else {
          methods = [directMethod!]
        }
      }

      // Create credential and send
      let credential: string
      const fakeResponse = new Response(null, {
        status: 402,
        headers: { [Constants.Headers.wwwAuthenticate]: Challenge.serialize(challenge) },
      })
      try {
        if (createCredentialFn) {
          credential = await createCredentialFn(fakeResponse)
        } else {
          const mppx = Mppx.create({ methods, polyfill: false })
          credential = await mppx.createCredential(fakeResponse)
        }
      } catch (error) {
        const msg = (error as Error).message
        if (msg.toLowerCase().includes('insufficient')) {
          results.push(skip(tag, `insufficient balance: ${msg}`))
          continue
        }
        results.push(fail(tag, msg))
        continue
      }

      results.push(check(`${tag}: submitted`))

      plugin?.prepareCredentialRequest?.({ challenge, credential, headers: fetchHeaders })
      await sendAndValidateResponse(
        results,
        url,
        endpoint,
        credential,
        fetchHeaders,
        fetchBody,
        verbose,
        paymentChain,
      )
    } finally {
      flush()
    }
  }

  return results
}

async function sendAndValidateResponse(
  results: CheckResult[],
  url: string,
  endpoint: EndpointSpec,
  credential: string,
  baseHeaders: Record<string, string>,
  fetchBody: string | undefined,
  verbose: boolean,
  explorerChain?: Chain | undefined,
): Promise<CheckResult[]> {
  let paymentResponse: Response
  try {
    paymentResponse = await fetchWithTimeout(
      url,
      {
        method: endpoint.method,
        headers: { ...baseHeaders, [Constants.Headers.authorization]: credential },
        body: fetchBody ?? null,
      },
      30_000,
    )
  } catch (error) {
    results.push(fail('Payment: send credential', (error as Error).message))
    return results
  }

  if (paymentResponse.status === 402) {
    const body = await paymentResponse.text().catch(() => '')
    let detail = 'Payment rejected'
    try {
      const problem = JSON.parse(body) as Record<string, unknown>
      detail = (problem.detail as string) ?? (problem.title as string) ?? detail
    } catch {}
    results.push(
      fail(
        'Payment: accepted',
        detail,
        'The server rejected a valid credential. Check that your payment verification logic accepts the credential format and that the payment was processed on-chain.',
      ),
    )
    return results
  }

  if (paymentResponse.status >= 400 && paymentResponse.status < 500) {
    results.push(
      warn(
        'Payment: post-payment response',
        `Got ${paymentResponse.status}`,
        'Payment succeeded but the endpoint returned a client error. The endpoint likely requires request body parameters. Use --body to provide them.',
      ),
    )
  } else if (paymentResponse.status >= 500) {
    results.push(
      fail(
        'Payment: server response',
        `Got ${paymentResponse.status}`,
        'Payment was accepted but the server errored while generating the response. Check server logs for the underlying error.',
      ),
    )
    return results
  } else {
    results.push(check('Payment: successful', `HTTP ${paymentResponse.status}`))
  }

  // Validate receipt
  const receiptHeader = paymentResponse.headers.get(Constants.Headers.paymentReceipt)
  if (!receiptHeader) {
    results.push(
      fail(
        'Payment-Receipt header present',
        undefined,
        'After accepting payment, include a Payment-Receipt header with a base64url-encoded JSON object containing: method, reference, status ("success"), and timestamp (ISO 8601).',
      ),
    )
  } else {
    results.push(check('Payment-Receipt header present'))
    try {
      const receipt = Receipt.deserialize(receiptHeader)
      results.push(check('Receipt parseable'))

      if (receipt.status === 'success') {
        results.push(check('Receipt status is "success"'))
      } else {
        results.push(fail('Receipt status is "success"', `Got: ${receipt.status}`))
      }

      if (receipt.reference) {
        const validTxHash = /^0x[0-9a-fA-F]{64}$/.test(receipt.reference)
        const validStripeRef = receipt.reference.startsWith('pi_')
        if (validTxHash || validStripeRef) {
          results.push(check('Receipt reference valid', receipt.reference.slice(0, 20) + '...'))
        } else {
          results.push(warn('Receipt reference format', receipt.reference.slice(0, 40)))
        }
      } else {
        results.push(warn('Receipt has reference', 'No reference field'))
      }

      if (receipt.timestamp) {
        const ts = new Date(receipt.timestamp)
        const age = Date.now() - ts.getTime()
        if (age < 60_000) {
          results.push(check('Receipt timestamp recent', `${Math.round(age / 1000)}s ago`))
        } else {
          results.push(warn('Receipt timestamp recent', `${Math.round(age / 60000)}m ago`))
        }
      }

      if (verbose) {
        console.log(pc.dim(`    Receipt: ${JSON.stringify(receipt, null, 2)}`))
      }
    } catch (error) {
      results.push(fail('Receipt parseable', (error as Error).message))
    }
  }

  // Validate response body
  const contentType = paymentResponse.headers.get('content-type') ?? ''
  const body = await paymentResponse.text().catch(() => '')

  if (body.length > 0) {
    results.push(
      check('Response body non-empty', `${contentType.split(';')[0]}, ${formatBytes(body.length)}`),
    )
  } else {
    const suspiciousHeaders = [...paymentResponse.headers.entries()].filter(
      ([key]) =>
        !key.startsWith('x-') &&
        ![
          'content-type',
          'content-length',
          'date',
          'server',
          'connection',
          'keep-alive',
          'cache-control',
          'vary',
          'access-control-allow-origin',
          'payment-receipt',
          'payment-session',
          'payment-session-snapshot',
        ].includes(key.toLowerCase()),
    )
    if (suspiciousHeaders.length > 0) {
      results.push(
        warn(
          'Response body empty -- data may be in headers only',
          suspiciousHeaders.map(([k]) => k).join(', '),
        ),
      )
    } else {
      results.push(warn('Response body empty'))
    }
  }

  if (!contentType) {
    results.push(warn('Content-Type header set'))
  } else {
    results.push(check('Content-Type header set', contentType.split(';')[0]))
  }

  // Explorer link for on-chain payments
  if (receiptHeader) {
    try {
      const receipt = Receipt.deserialize(receiptHeader)
      if (receipt.reference && /^0x[0-9a-fA-F]{64}$/.test(receipt.reference)) {
        const explorerUrl = explorerChain?.blockExplorers?.default?.url
        if (explorerUrl) {
          const path = explorerUrl.includes('tempo') ? 'receipt' : 'tx'
          results.push(check('On-chain transaction', `${explorerUrl}/${path}/${receipt.reference}`))
        }
      }
    } catch {}
  }

  return results
}
