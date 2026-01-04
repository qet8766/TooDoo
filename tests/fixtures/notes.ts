/**
 * Test fixtures for Notetank Note-related tests
 */

import type { Note } from '@shared/types'

/**
 * Creates a note with default values that can be overridden
 */
export const createNote = (overrides: Partial<Note> = {}): Note => {
  const now = Date.now()
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Note',
    content: 'Test note content',
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...overrides,
  }
}

/**
 * Sample notes for testing different scenarios
 */
export const sampleNotes = {
  basic: createNote({ id: 'basic-note', title: 'Basic Note', content: 'Simple content' }),
  withLongContent: createNote({
    id: 'long-note',
    title: 'Note with Long Content',
    content: 'This is a much longer note that contains multiple paragraphs.\n\nParagraph 2 continues here with more detailed information.\n\nParagraph 3 wraps up the note.',
  }),
  markdown: createNote({
    id: 'markdown-note',
    title: 'Markdown Note',
    content: '# Heading\n\n- Item 1\n- Item 2\n\n**Bold** and *italic* text.',
  }),
  deleted: createNote({ id: 'deleted-note', title: 'Deleted Note', isDeleted: true }),
  old: createNote({
    id: 'old-note',
    title: 'Old Note',
    createdAt: Date.now() - 86400000 * 30, // 30 days ago
    updatedAt: Date.now() - 86400000 * 7,  // Updated 7 days ago
  }),
}

/**
 * Creates a set of notes for list testing
 */
export const createNoteListTestSet = (): Note[] => [
  createNote({ id: 'list-1', title: 'First Note', content: 'Content 1' }),
  createNote({ id: 'list-2', title: 'Second Note', content: 'Content 2' }),
  createNote({ id: 'list-3', title: 'Third Note', content: 'Content 3' }),
  createNote({ id: 'list-4', title: 'Fourth Note', content: 'Content 4' }),
  createNote({ id: 'list-5', title: 'Fifth Note', content: 'Content 5' }),
]

/**
 * Edge case notes for validation testing
 */
export const edgeCaseNotes = {
  emptyTitle: { id: 'edge-n1', title: '', content: 'Content' },
  whitespaceTitle: { id: 'edge-n2', title: '   ', content: 'Content' },
  veryLongTitle: { id: 'edge-n3', title: 'X'.repeat(250), content: 'Content' },
  veryLongContent: { id: 'edge-n4', title: 'Test', content: 'Y'.repeat(60000) },
  specialChars: { id: 'edge-n5', title: '<script>alert("xss")</script>', content: 'Content' },
  emptyContent: { id: 'edge-n6', title: 'Empty Content Note', content: '' },
}

/**
 * Notes for search testing
 */
export const searchTestNotes: Note[] = [
  createNote({ id: 'search-1', title: 'Meeting Notes', content: 'Discussed project timeline and deliverables' }),
  createNote({ id: 'search-2', title: 'Recipe Ideas', content: 'Pasta with tomato sauce, grilled chicken' }),
  createNote({ id: 'search-3', title: 'Project Planning', content: 'Phase 1: Research, Phase 2: Development' }),
  createNote({ id: 'search-4', title: 'Book Recommendations', content: 'Clean Code, The Pragmatic Programmer' }),
  createNote({ id: 'search-5', title: 'Todo Ideas', content: 'Organize desk, buy groceries, call doctor' }),
]
