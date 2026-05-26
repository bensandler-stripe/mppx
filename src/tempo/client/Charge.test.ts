import { Challenge, Credential } from 'mppx'
import { createClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoLocalnet } from 'viem/chains'
import { describe, expect, test } from 'vp/test'

import * as Methods from '../Methods.js'
import { charge } from './Charge.js'

const account = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
)
const currency = '0x3333333333333333333333333333333333333333'
const recipient = '0x2222222222222222222222222222222222222222'

type ChargeRequest = ReturnType<typeof Methods.charge.schema.request.parse>

function createChallenge(
  overrides: Partial<Parameters<typeof Methods.charge.schema.request.parse>[0]> = {},
): Challenge.Challenge<ChargeRequest, 'charge', 'tempo'> {
  const request = Methods.charge.schema.request.parse({
    amount: '0',
    currency,
    decimals: 6,
    recipient,
    ...overrides,
  })
  return Challenge.from({
    id: 'test-challenge-id',
    intent: 'charge',
    method: 'tempo',
    realm: 'api.example.com',
    request,
  }) as Challenge.Challenge<ChargeRequest, 'charge', 'tempo'>
}

describe('tempo.charge client', () => {
  test('uses client chain ID when the challenge omits chainId', async () => {
    const client = createClient({
      account,
      chain: tempoLocalnet,
      transport: http('http://127.0.0.1'),
    })
    const method = charge({
      account,
      getClient: () => client,
    })

    const credential = Credential.deserialize(
      await method.createCredential({
        challenge: createChallenge(),
        context: {},
      }),
    )

    expect(credential.source).toBe(`did:pkh:eip155:${tempoLocalnet.id}:${account.address}`)
  })

  test('uses challenge chainId for client resolution and proof source', async () => {
    let requestedChainId: number | undefined
    const chainId = 42431
    const client = createClient({
      account,
      chain: tempoLocalnet,
      transport: http('http://127.0.0.1'),
    })
    const method = charge({
      account,
      getClient: (parameters) => {
        requestedChainId = parameters.chainId
        return client
      },
    })

    const credential = Credential.deserialize(
      await method.createCredential({
        challenge: createChallenge({ chainId }),
        context: {},
      }),
    )

    expect(requestedChainId).toBe(chainId)
    expect(credential.source).toBe(`did:pkh:eip155:${chainId}:${account.address}`)
  })
})
