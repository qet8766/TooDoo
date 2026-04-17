/**
 * Characterization tests for Overlay.tsx. Not coverage-chasing — these lock in
 * the observable behaviors that Phase 3 (Overlay decomposition) must preserve:
 *   - initial render pulls tasks via window.toodoo.tasks.list()
 *   - onTasksChanged subscription is wired (unsubscribe returned)
 *   - edit flow: double-click → change title → Save calls tasks.update
 *   - minimize toggle calls setMinimized and hides the main grid
 *   - scorching-mode disables the minimize button
 *
 * These tests mock window.toodoo completely and do not require a real
 * Electron/preload bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '@shared/types'

import Overlay from '../../src/renderer/pages/Overlay'

type MockToodoo = Window['toodoo']

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: overrides.id ?? 'task-1',
  title: overrides.title ?? 'Test task',
  description: overrides.description,
  category: overrides.category ?? 'hot',
  sortOrder: overrides.sortOrder ?? 'a0',
  createdAt: overrides.createdAt ?? 1_700_000_000_000,
  updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
  scheduledDate: overrides.scheduledDate,
  scheduledTime: overrides.scheduledTime,
  projectNotes: overrides.projectNotes ?? [],
  deletedAt: overrides.deletedAt,
})

const makeMockToodoo = (tasks: Task[]): MockToodoo => {
  const listeners = new Set<(tasks: Task[]) => void>()
  return {
    tasks: {
      list: vi.fn(async () => tasks),
      add: vi.fn(),
      update: vi.fn(async ({ id, ...patch }) => ({
        success: true,
        data: { ...tasks.find((t) => t.id === id)!, ...patch },
      })),
      remove: vi.fn(async () => ({ success: true, data: { id: 'task-1' } })),
      reorder: vi.fn(async () => ({ success: true })),
      addNote: vi.fn(),
      updateNote: vi.fn(),
      removeNote: vi.fn(),
    },
    notes: {} as MockToodoo['notes'],
    auth: {
      getStatus: vi.fn(async () => ({ isSignedIn: true, email: 'test@example.com' })),
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
    sync: {
      getStatus: vi.fn(async () => ({ status: 'synced' })),
    },
    onTasksChanged: vi.fn((fn: (tasks: Task[]) => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }),
    onNotesChanged: vi.fn(() => () => {}),
    onAuthStatusChanged: vi.fn(() => () => {}),
    onSyncStatusChanged: vi.fn(() => () => {}),
    openQuickAdd: vi.fn(),
    switchView: vi.fn(),
    setMinimized: vi.fn(),
    setCalendarOpen: vi.fn(),
    resizeWindow: vi.fn(),
  } as unknown as MockToodoo
}

let mockToodoo: MockToodoo

beforeEach(() => {
  mockToodoo = makeMockToodoo([makeTask({ id: 't1', title: 'Write plan', category: 'hot' })])
  ;(window as unknown as { toodoo: MockToodoo }).toodoo = mockToodoo
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as unknown as { toodoo?: MockToodoo }).toodoo
})

describe('Overlay characterization', () => {
  it('fetches tasks on mount and renders them', async () => {
    render(<Overlay />)

    expect(mockToodoo.tasks.list).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Write plan')).toBeInTheDocument()
    expect(mockToodoo.onTasksChanged).toHaveBeenCalledTimes(1)
  })

  it('edit flow: double-click task → change title → Save calls tasks.update', async () => {
    const user = userEvent.setup()
    render(<Overlay />)

    const title = await screen.findByText('Write plan')
    await user.dblClick(title)

    // After double-click, an input with the task title appears
    const input = await screen.findByDisplayValue('Write plan')
    await user.clear(input)
    await user.type(input, 'Write plan v2')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockToodoo.tasks.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't1', title: 'Write plan v2' }),
      )
    })
  })

  it('minimize toggle hides main grid and calls setMinimized(true)', async () => {
    const user = userEvent.setup()
    render(<Overlay />)

    await screen.findByText('Write plan')

    const minimizeBtn = screen.getByTitle(/Focus mode/i)
    await user.click(minimizeBtn)

    expect(mockToodoo.setMinimized).toHaveBeenCalledWith(true)

    const overlay = screen.getByTestId('overlay')
    expect(overlay.className).toMatch(/minimized/)
    expect(screen.queryByText('Write plan')).not.toBeInTheDocument()
  })

  it('scorching mode disables the minimize button', async () => {
    mockToodoo = makeMockToodoo([makeTask({ id: 's1', title: 'URGENT', category: 'scorching' })])
    ;(window as unknown as { toodoo: MockToodoo }).toodoo = mockToodoo

    render(<Overlay />)
    await screen.findByText('URGENT')

    const minimizeBtn = screen.getByTitle(/Clear scorching tasks first/i)
    expect(minimizeBtn).toBeDisabled()
  })

  it('onTasksChanged push re-renders with new task list', async () => {
    render(<Overlay />)
    await screen.findByText('Write plan')

    // Pull the subscribed callback out of the mock and invoke it
    const subscribeMock = mockToodoo.onTasksChanged as unknown as ReturnType<typeof vi.fn>
    const callback = subscribeMock.mock.calls[0][0] as () => Promise<void>

    // Swap the list() return value, then trigger the callback (which re-fetches)
    ;(mockToodoo.tasks.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeTask({ id: 't2', title: 'Refactored!', category: 'warm' }),
    ])
    await act(async () => {
      await callback()
    })

    expect(await screen.findByText('Refactored!')).toBeInTheDocument()
  })
})
