import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Note } from '@shared/types'
import { useFontSize } from '../../hooks/useFontSize'
import { useDeleteArm } from '../../hooks/useDeleteArm'

const NotetankOverlay = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const { fontSize, handleFontSizeChange } = useFontSize('notetank-font-size')
  const { armedForDelete, armForDelete, disarmDelete } = useDeleteArm()
  const [syncStatus, setSyncStatus] = useState<string>('offline')

  useEffect(() => {
    window.toodoo.sync.getStatus().then((s) => setSyncStatus(s.status))
    const unsub = window.toodoo.onSyncStatusChanged((s) => setSyncStatus(s.status))
    return unsub
  }, [])

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await window.toodoo.notes.list()
      setNotes(data)
    } catch (error) {
      console.error('Failed to fetch notes:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.toodoo.onNotesChanged(fetchNotes)
    fetchNotes()
    return unsubscribe
  }, [fetchNotes])

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes
    const q = searchQuery.toLowerCase()
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }, [notes, searchQuery])

  const handleNewNote = () => {
    window.toodoo.noteEditor.open()
  }

  const handleEditNote = (noteId: string) => {
    window.toodoo.noteEditor.open(noteId)
  }

  const handleDeleteNote = async (noteId: string) => {
    disarmDelete(noteId)
    await window.toodoo.notes.remove(noteId)
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  const handleNoteDeleteClick = (noteId: string) => {
    if (armedForDelete.has(noteId)) {
      handleDeleteNote(noteId)
    } else {
      armForDelete(noteId)
    }
  }

  const toggleExpand = (noteId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) {
        next.delete(noteId)
      } else {
        next.add(noteId)
      }
      return next
    })
  }

  const switchToTasks = () => {
    window.toodoo.switchView('toodoo')
  }

  return (
    <div className="overlay-shell notetank-shell" style={{ fontSize: `${fontSize}px` }}>
      <div className="overlay-topbar-fixed" title="Drag to move">
        <div className="topbar-features">
          <button className="feature-btn no-drag" onClick={switchToTasks} title="Switch to Tasks">
            Tasks
          </button>
        </div>
        <div className="topbar-controls no-drag">
          <span className={`sync-dot sync-${syncStatus}`} title={`Sync: ${syncStatus}`} />
          <button className="font-btn" onClick={() => handleFontSizeChange(-1)}>
            A-
          </button>
          <button className="font-btn" onClick={() => handleFontSizeChange(1)}>
            A+
          </button>
        </div>
      </div>

      <div className="notetank-content no-drag">
        <div className="notetank-toolbar">
          <input
            className="search-bar"
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="small-button add-note-btn" onClick={handleNewNote}>
            + New
          </button>
        </div>

        {isLoading ? (
          <p className="muted">Loading...</p>
        ) : filteredNotes.length === 0 ? (
          <p className="muted">{searchQuery ? 'No matching notes' : 'No notes yet. Press Alt+Shift+N to add one!'}</p>
        ) : (
          <div className="note-list">
            {filteredNotes.map((note) => (
              <div key={note.id} className={`note-card ${expandedNotes.has(note.id) ? 'expanded' : ''}`}>
                <div className="note-card-header">
                  <div
                    className={`checkbox delete-checkbox ${armedForDelete.has(note.id) ? 'armed' : ''}`}
                    onClick={() => handleNoteDeleteClick(note.id)}
                  >
                    <span />
                  </div>
                  <div className="note-title-area" onClick={() => toggleExpand(note.id)}>
                    <h4 className="note-title">{note.title}</h4>
                    <span className="note-meta">{new Date(note.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <button className="small-button" onClick={() => handleEditNote(note.id)}>
                    Edit
                  </button>
                </div>
                {expandedNotes.has(note.id) && note.content && (
                  <div className="note-content-expanded" onDoubleClick={() => handleEditNote(note.id)}>
                    {note.content}
                  </div>
                )}
                {!expandedNotes.has(note.id) && note.content && (
                  <p className="note-content-preview" onClick={() => toggleExpand(note.id)}>
                    {note.content.slice(0, 100)}
                    {note.content.length > 100 ? '...' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default NotetankOverlay
