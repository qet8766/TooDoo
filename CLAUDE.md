# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TooDoo is a standalone Windows Electron app extracted from the Irodori tools deck. It provides an always-on-top todo overlay with category buckets and global-hotkey quick-add popups.
Actively use typescript.

**Stack:** Electron + React 19 + TypeScript + Vite (`vite-plugin-electron`) + Zustand.

## Commands

```bash
npm run dev              # Development server with hot reload (lax types)
npm run build            # TypeScript check + Vite build (RUN OFTEN to catch strict type errors)
npm run electron:build   # Full build + package .exe/.nsis
npm run lint             # ESLint
```

## General Instructions & Best Practices

Strictly follow these Electron constraints:

- **Security:** Enable `contextIsolation: true`, disable `nodeIntegration`. Never use the remote module.
- **IPC Pattern:** Use `ipcRenderer.invoke` (renderer) → `ipcMain.handle` (main) for 2-way comms. Use `ipcRenderer.send` only for fire-and-forget.
- **Path Safety:** Do **NOT** use `__dirname` for assets. Use `app.getAppPath()` or `process.resourcesPath` to ensure paths work in the packaged ASAR/exe.
- **Window Management:** Use `win.once('ready-to-show', win.show)` to prevent "white flash" on startup.
- **Windows Lifecycle:** Explicitly handle `window-all-closed`. Since this is a tray app, do not quit by default; minimize to tray instead.

## Architecture

Three-process Electron model:

- `src/main/` — main process: window creation, IPC handlers, global shortcuts, sync
- `src/preload/` — context bridge exposing `window.toodoo` to the renderer
- `src/renderer/` — React UI (HashRouter) for overlay and quick-add popup

Windows:

- **Overlay** (`#/toodoo`) — main task view with 4 category columns (hot, warm, cool, project) or scorching mode
- **Quick-add popup** (`#/quick-add?category=...`) — cursor-positioned form opened via global hotkeys

IPC flow: renderer calls `window.toodoo.*` → preload uses `ipcRenderer.invoke/send` → main handles via `ipcMain.handle/on` → broadcasts `tasks:changed` to all windows.

## Data & Sync

**NAS-based centralized storage** with local cache for offline operation:

- **NAS store:** `{nasPath}/toodoo-store.json` — primary data on shared NAS folder
- **Local cache:** `{userData}/toodoo-cache.json` — offline copy with pending changes
- **Config:** `{userData}/toodoo-config.json` — machine-specific NAS path configuration

NAS sync:

- File locking via `toodoo-store.lock` prevents concurrent write conflicts
- Background scheduler syncs every 30 seconds when NAS is available
- Pending changes tracked locally and merged on next successful sync
- Last-write-wins (LWW) conflict resolution using `updatedAt` timestamps

First-run setup:

- If `TOODOO_NAS_PATH` env var is set, uses that path directly
- Otherwise shows Setup dialog (`#/setup`) to configure NAS path
- Each machine stores its own NAS path (supports different mount points)

## Hotkeys

Defined in `src/main/shortcuts/definitions.ts`:

- `CapsLock` — quick add **Scorching** task (white, most urgent - panic button!)
- `Alt+Shift+H` — quick add **H**ot task (red, high priority)
- `Alt+Shift+W` — quick add **W**arm task (yellow, moderate priority)
- `Alt+Shift+C` — quick add **C**ool task (blue, low priority/someday)
- `Alt+Shift+P` — quick add **P**roject task (violet, long-term initiatives)

## Key Files

- `src/main/index.ts` — main process entry, IPC handlers, bootstrap
- `src/main/windows/base.ts` — window factory (overlay/popup)
- `src/main/db/database.ts` — local cache + NAS sync with file locking
- `src/main/db/config.ts` — machine-specific NAS path configuration
- `src/main/db/file-lock.ts` — file locking for concurrent NAS access
- `src/preload/index.ts` — `window.toodoo` API
- `src/renderer/pages/Overlay.tsx` — main overlay UI
- `src/renderer/pages/QuickAdd.tsx` — quick-add popup UI
- `src/renderer/pages/Setup.tsx` — first-run NAS path configuration
- `src/shared/types.ts` — `Task`, `ProjectNote`, `TaskCategory` types
- `src/shared/ipc.ts` — IPC channel definitions (CONFIG_*, NAS_*)

## Notes for Changes

- **Update Triad:** When adding APIs, update `src/preload/index.ts`, `src/preload/types.d.ts`, AND `src/main/index.ts`.
- **Dependency Check:** If adding a library, ensure it is in `dependencies` (not `devDependencies`) if it is needed at runtime (e.g., `sqlite3`), otherwise the build will crash.
- **Renderer API:** The preload exposes `window.toodoo` (not `window.irodori`).
