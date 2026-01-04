import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'

const NoteEditor = () => {
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const noteId = params.get('id')

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(!!noteId)
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement | null>(null)

  // Load existing note if editing
  useEffect(() => {
    if (!noteId) {
      titleRef.current?.focus()
      return
    }

    const loadNote = async () => {
      try {
        const notes = await window.toodoo.notes.list()
        const note = notes.find(n => n.id === noteId)
        if (note) {
          setTitle(note.title)
          setContent(note.content)
        } else {
          setStatus('Note not found')
        }
      } catch (error) {
        setStatus('Failed to load note')
        console.error('Failed to load note:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadNote()
  }, [noteId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setStatus('Title is required')
      return
    }

    if (trimmedTitle.length > 200) {
      setStatus('Title too long (max 200 characters)')
      return
    }

    const trimmedContent = content.trim()
    if (trimmedContent.length > 50000) {
      setStatus('Content too long (max 50000 characters)')
      return
    }

    try {
      setStatus('Saving...')
      if (noteId) {
        // Update existing
        const result = await window.toodoo.notes.update({
          id: noteId,
          title: trimmedTitle,
          content: trimmedContent,
        })
        if (result && 'error' in result) {
          setStatus(`Failed: ${result.error}`)
          return
        }
      } else {
        // Create new
        const result = await window.toodoo.notes.add({
          id: crypto.randomUUID(),
          title: trimmedTitle,
          content: trimmedContent,
        })
        if (result && 'error' in result) {
          setStatus(`Failed: ${result.error}`)
          return
        }
      }
      setStatus('Saved!')
      await new Promise(resolve => setTimeout(resolve, 200))
      window.close()
    } catch (error) {
      console.error('Failed to save note:', error)
      setStatus(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter to save
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  if (isLoading) {
    return (
      <div className="quick-add-shell note-editor-shell">
        <p className="muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="quick-add-shell note-editor-shell">
      <div className="quick-add-header">
        <div>
          <p className="muted">{noteId ? 'Edit note' : 'New note'}</p>
          <h3>Notetank</h3>
        </div>
        <button className="small-button" type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <form ref={formRef} className="input-stack" onSubmit={handleSubmit}>
        <input
          ref={titleRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="no-drag"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Note content... (Ctrl+Enter to save)"
          rows={8}
          className="no-drag note-content-editor"
          onKeyDown={handleTextareaKeyDown}
        />
        <button className="button" type="submit">
          {noteId ? 'Save' : 'Create'}
        </button>
      </form>

      {status && <p className="muted status-text">{status}</p>}
    </div>
  )
}

export default NoteEditor
