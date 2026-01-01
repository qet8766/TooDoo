# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TooDoo is a standalone Windows Electron app extracted from the Irodori tools deck. It provides an always-on-top todo overlay with category buckets and global-hotkey quick-add popups.

Stack: Electron + React 19 + TypeScript + Vite (`vite-plugin-electron`) + Zustand.

## Commands

```bash
npm run dev              # Development server with hot reload
npm run build            # TypeScript check + Vite build
npm run electron:build   # Full build + package .exe/.nsis
npm run lint             # ESLint
```

## Architecture

**Three-process Electron model:**
- `src/main/` — main process: window creation, IPC handlers, global shortcuts, sync
- `src/preload/` — context bridge exposing `window.toodoo` to the renderer
- `src/renderer/` — React UI (HashRouter) for overlay and quick-add popup

**Windows:**
- Overlay (`#/toodoo`) — main task view with 3 category columns (short-term, long-term, project) or immediate mode
- Quick-add popup (`#/quick-add?category=...`) — cursor-positioned form opened via global hotkeys

**IPC flow:** renderer calls `window.toodoo.*` → preload uses `ipcRenderer.invoke/send` → main handles via `ipcMain.handle/on` → broadcasts `tasks:changed` to all windows.

## Data & Sync

Local persistence: JSON file at `{app.getPath('userData')}/toodoo-store.json` (see `src/main/db/database.ts`).

REST sync:
- `syncQueue` stores pending operations while offline
- Background scheduler polls `/api/health` and pulls `/api/tasks` when online
- Default API URL: `http://100.76.250.5:3456` (configurable via settings)

## Hotkeys

Defined in `src/main/shortcuts/definitions.ts`:
- `Alt+Shift+S` — quick add short-term task
- `Alt+Shift+L` — quick add long-term task
- `Alt+Shift+P` — quick add project task
- `Alt+Shift+I` — quick add immediate task

## Key Files

- `src/main/index.ts` — main process entry, IPC handlers, bootstrap
- `src/main/windows/base.ts` — window factory (overlay/popup)
- `src/main/db/database.ts` — local JSON store + REST sync
- `src/preload/index.ts` — `window.toodoo` API
- `src/preload/types.d.ts` — TypeScript typings for preload API
- `src/renderer/pages/Overlay.tsx` — main overlay UI
- `src/renderer/pages/QuickAdd.tsx` — quick-add popup UI
- `src/shared/types.ts` — Task, ProjectNote, TaskCategory types

## Notes for Changes

- When modifying IPC APIs, update both `src/preload/index.ts` and `src/preload/types.d.ts`, plus the matching `ipcMain` handler in `src/main/index.ts`.
- The preload exposes `window.toodoo` (not `window.irodori` as in the parent project).
