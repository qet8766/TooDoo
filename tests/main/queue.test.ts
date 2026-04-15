/**
 * Queue Unit Tests
 *
 * Tests for the async operation serializer.
 */

import { describe, it, expect } from 'vitest'
import { createQueue } from '@main/db/queue'

describe('createQueue', () => {
  it('should execute a single operation', async () => {
    const queue = createQueue()
    const result = await queue.enqueue(() => 42)
    expect(result).toBe(42)
  })

  it('should serialize concurrent operations', async () => {
    const queue = createQueue()
    const order: number[] = []

    const op1 = queue.enqueue(() => {
      order.push(1)
      return 'first'
    })
    const op2 = queue.enqueue(() => {
      order.push(2)
      return 'second'
    })
    const op3 = queue.enqueue(() => {
      order.push(3)
      return 'third'
    })

    const [r1, r2, r3] = await Promise.all([op1, op2, op3])
    expect(r1).toBe('first')
    expect(r2).toBe('second')
    expect(r3).toBe('third')
    expect(order).toEqual([1, 2, 3])
  })

  it('should continue after a failed operation', async () => {
    const queue = createQueue()

    const failing = queue.enqueue(() => {
      throw new Error('boom')
    })

    await expect(failing).rejects.toThrow('boom')

    // Next operation should still work
    const result = await queue.enqueue(() => 'recovered')
    expect(result).toBe('recovered')
  })
})
