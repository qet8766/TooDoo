/**
 * newId() must keep working in environments where uuid's crypto-backed rng
 * throws — i.e. Hermes running a binary built without the
 * react-native-get-random-values TurboModule. The mock mirrors that device
 * behavior: a bare v4() call throws, v4 with an explicit rng succeeds.
 */
jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid')
  return {
    v4: jest.fn((options?: { rng?: () => Uint8Array }) => {
      if (!options?.rng) throw new Error('crypto.getRandomValues() not supported')
      return actual.v4(options)
    }),
  }
})

import { v4 } from 'uuid'
import { newId } from '../lib/id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('falls back to a Math.random rng when the crypto-backed path throws', () => {
    const id = newId()
    expect(id).toMatch(UUID_V4)
    expect(v4).toHaveBeenCalledTimes(2) // primary attempt, then fallback with explicit rng
  })

  it('generates unique ids on repeated calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
  })
})
