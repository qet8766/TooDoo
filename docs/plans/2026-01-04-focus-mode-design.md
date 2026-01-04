# Focus Mode (Timed Minimize) Design

## Overview

Add a "Focus Mode" that minimizes the TooDoo overlay to a compact strip showing only task counts. The overlay auto-expands after 1 hour to ensure users don't forget their tasks.

## Core Behavior

### States
- **Expanded** (default): Full view with task columns and cards
- **Minimized**: Compact strip showing only colored dots + counts

### Transitions
| Trigger | Action |
|---------|--------|
| User clicks minimize button | Window shrinks to compact strip |
| 1 hour elapses | Auto-expand (no prompt) |
| User clicks expand button | Immediate expand |
| Scorching task added while minimized | Immediate auto-expand |

### Scorching Mode Constraint
- If **any scorching tasks exist** → Minimize button is **disabled**
- Scorching = panic mode, cannot be hidden
- User must clear scorching tasks before minimizing

## Visual Layout

### Expanded State
```
┌─────────────────────────────────────────────────────┐
│ ⠿⠿⠿        [Notes]        [sync] [A-] [A+] [▼]    │
├─────────────────────────────────────────────────────┤
│  ●2     ●4      ●1      ●3                          │
│ [cards] [cards] [cards] [cards]                     │
│  ...     ...     ...     ...                        │
└─────────────────────────────────────────────────────┘
```

### Minimized State
```
┌─────────────────────────────────────────────────────┐
│ ⠿⠿⠿    ●2  ●4  ●1  ●3    [sync] [A-] [A+] [▲]    │
└─────────────────────────────────────────────────────┘
```

### Details
- Dots use existing category colors (red/yellow/blue/violet)
- Dots remain **clickable** in minimized view to open quick-add
- `[▼]`/`[▲]` button toggles state
- Topbar remains draggable in both states
- Window height shrinks to ~50px when minimized

## Implementation

### Renderer (`src/renderer/pages/Overlay.tsx`)
- New state: `isMinimized` (boolean)
- New state: `minimizedAt` (timestamp | null)
- Timer effect: Check every minute if 1 hour elapsed → auto-expand
- Watch `tasksByCategory.scorching.length`: If minimized and scorching appears → expand
- Conditional render: Compact dots row vs full columns

### Main Process (`src/main/index.ts`)
- New IPC handler: `window:setMinimized`
- Store previous window height before shrinking
- Restore height on expand

### Preload (`src/preload/index.ts`)
- Expose `window.toodoo.setMinimized(isMinimized: boolean)`

### Types (`src/preload/types.d.ts`)
- Add `setMinimized` to `ToodooAPI` interface

### Styles (`src/renderer/index.css`)
- New `.minimized-bar` class for compact dots row
- Transition animations for smooth shrink/expand

## File Changes

| File | Change |
|------|--------|
| `src/renderer/pages/Overlay.tsx` | Minimize state, timer, conditional UI |
| `src/renderer/index.css` | `.minimized-bar` styles |
| `src/main/index.ts` | `window:setMinimized` IPC handler |
| `src/preload/index.ts` | Expose `setMinimized` API |
| `src/preload/types.d.ts` | Type definition |

## Constants

- `MINIMIZE_DURATION_MS = 60 * 60 * 1000` (1 hour)
- `MINIMIZE_CHECK_INTERVAL_MS = 60 * 1000` (check every minute)
- `MINIMIZED_WINDOW_HEIGHT = 50` (pixels)
