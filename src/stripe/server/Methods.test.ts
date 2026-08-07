import { stripe } from 'mppx/server'
import { describe, expect, test, vi } from 'vp/test'

import type { AnyServer } from '../../Method.js'
import type { StripeClient } from '../internal/types.js'

function createMockStripeClient(): StripeClient {
  return {
    paymentIntents: {
      create: vi.fn(async () => ({ id: 'pi_mock', status: 'succeeded' })),
    },
    rawRequest: vi.fn(async (_method: string, path: string) => {
      if (path.includes('deposit_addresses')) {
        if (path.includes('limit=1')) return { data: [{ address: '0xabc' }] }
        return { address: '0xnew' }
      }
      return {}
    }),
  }
}

function findMethod(methods: readonly AnyServer[], name: string, intent: string) {
  return methods.find((m) => m.name === name && m.intent === intent)!
}

describe('stripe.create() defaultMethods', () => {
  test('returns tempo and spt methods', async () => {
    const client = createMockStripeClient()
    const mp = stripe({ client, networkId: 'test-profile', livemode: false })

    const methods = await mp.defaultMethods()

    expect(findMethod(methods, 'tempo', 'charge')).toBeDefined()
    expect(findMethod(methods, 'stripe', 'charge')).toBeDefined()
  })

  test.each(['tempo', 'spt'] as const)('exclude removes %s', async (excluded) => {
    const client = createMockStripeClient()
    const mp = stripe({ client, networkId: 'test-profile', livemode: false })

    const methods = await mp.defaultMethods({ exclude: [excluded] })
    const expectedName = excluded === 'spt' ? 'stripe' : excluded

    expect(methods.find((m) => m.name === expectedName && m.intent === 'charge')).toBeUndefined()
    expect(methods.length).toBeGreaterThan(0)
  })
})

describe('stripe.create() PI recording', () => {
  test('onPaymentSuccess handler returns a Promise', async () => {
    const client = createMockStripeClient()
    const mp = stripe({
      client,
      networkId: 'test-profile',
      livemode: false,
    })

    const methods = await mp.defaultMethods()
    const tempoMethod = findMethod(methods, 'tempo', 'charge')
    expect(tempoMethod.onPaymentSuccess).toBeTypeOf('function')

    const result = tempoMethod.onPaymentSuccess!({
      receipt: { reference: '0xtx123' },
      request: { amount: '500000' },
    })

    expect(result).toBeInstanceOf(Promise)
    await result
    expect(client.paymentIntents.create).toHaveBeenCalledOnce()
  })

  test('onPaymentSuccess returns undefined when receipt has no reference', async () => {
    const client = createMockStripeClient()
    const mp = stripe({
      client,
      networkId: 'test-profile',
      livemode: false,
    })

    const methods = await mp.defaultMethods()
    const tempoMethod = findMethod(methods, 'tempo', 'charge')

    const result = tempoMethod.onPaymentSuccess!({
      receipt: {},
      request: { amount: '500000' },
    })

    expect(result).toBeUndefined()
    expect(client.paymentIntents.create).not.toHaveBeenCalled()
  })
})

describe('stripe.create() custom hook composition', () => {
  test('composes user hook with PI recorder for custom rails', async () => {
    const client = createMockStripeClient()
    const userHookCalls: unknown[] = []

    const mp = stripe({
      client,
      networkId: 'test-profile',
      livemode: false,
      depositAddresses: { tempo: '0xtempoaddr', solana: 'SOLaddr' },
    })

    const methods = mp.defaultMethods().additional({
      solana: (_address) => ({
        name: 'solana',
        intent: 'charge',
        schema: {
          request: { parse: (x: unknown) => x },
          response: { parse: (x: unknown) => x },
        } as AnyServer['schema'],
        onPaymentSuccess: (params: unknown) => {
          userHookCalls.push(params)
        },
      }),
    })

    const solanaMethod = findMethod(methods, 'solana', 'charge')

    const params = { receipt: { reference: '0xsolhash' }, request: { amount: '10000' } }
    const result = solanaMethod.onPaymentSuccess!(params)
    expect(result).toBeInstanceOf(Promise)
    await result

    expect(userHookCalls).toHaveLength(1)
    expect(userHookCalls[0]).toBe(params)
    expect(client.paymentIntents.create).toHaveBeenCalledOnce()
  })

  test('uses recorder alone when custom rail has no user hook', async () => {
    const client = createMockStripeClient()

    const mp = stripe({
      client,
      networkId: 'test-profile',
      livemode: false,
      depositAddresses: { tempo: '0xtempoaddr', solana: 'SOLaddr' },
    })

    const methods = mp.defaultMethods().additional({
      solana: (_address) => ({
        name: 'solana',
        intent: 'charge',
        schema: {
          request: { parse: (x: unknown) => x },
          response: { parse: (x: unknown) => x },
        } as AnyServer['schema'],
      }),
    })

    const solanaMethod = findMethod(methods, 'solana', 'charge')

    await solanaMethod.onPaymentSuccess!({
      receipt: { reference: '0xsolhash' },
      request: { amount: '10000' },
    })

    expect(client.paymentIntents.create).toHaveBeenCalledOnce()
  })
})

describe('stripe.create() deposit address cache isolation', () => {
  test('different clients do not share cached addresses', async () => {
    const client1 = createMockStripeClient()
    const client2: StripeClient = {
      paymentIntents: { create: vi.fn(async () => ({ id: 'pi_2', status: 'succeeded' })) },
      rawRequest: vi.fn(async () => ({ data: [{ address: '0xdifferent' }] })),
    }

    const mp1 = stripe({ client: client1, networkId: 'profile1', livemode: false })
    const mp2 = stripe({ client: client2, networkId: 'profile2', livemode: true })

    const addr1 = await mp1.findOrCreateDepositAddress('tempo')
    const addr2 = await mp2.findOrCreateDepositAddress('tempo')

    expect(addr1).toBe('0xabc')
    expect(addr2).toBe('0xdifferent')
    expect(client1.rawRequest).toHaveBeenCalledOnce()
    expect(client2.rawRequest).toHaveBeenCalledOnce()
  })

  test('same client reuses cached address', async () => {
    const client = createMockStripeClient()
    const mp = stripe({ client, networkId: 'profile', livemode: false })

    const addr1 = await mp.findOrCreateDepositAddress('tempo')
    const addr2 = await mp.findOrCreateDepositAddress('tempo')

    expect(addr1).toBe(addr2)
    expect(client.rawRequest).toHaveBeenCalledOnce()
  })
})
