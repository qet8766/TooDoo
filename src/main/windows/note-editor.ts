import { createSingletonWindowManager, createWindow, loadRoute, repositionWindow, type WindowConfig } from './base'

const manager = createSingletonWindowManager()
const config: WindowConfig = { type: 'popup', route: '/note-editor', width: 400, height: 340, position: 'cursor', resizable: true }

export const createNoteEditorWindow = (noteId?: string) => {
  const route = noteId ? `/note-editor?id=${encodeURIComponent(noteId)}` : '/note-editor'
  const existing = manager.get()
  if (existing) {
    loadRoute(existing, route)
    repositionWindow(existing, config)
    existing.show()
    existing.focus()
    return existing
  }
  return manager.create(() => createWindow({ ...config, route }))
}

export const closeNoteEditorWindow = () => manager.close()
