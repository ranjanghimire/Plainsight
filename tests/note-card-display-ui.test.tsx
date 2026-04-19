/**
 * NoteCard read-only display: read-more (7+ logical lines), show more/less controls,
 * and extra spacing after a bold first line when a second line exists.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NoteCard } from '../src/components/NoteCard';
import { TagsNavProvider } from '../src/context/TagsNavContext';

function bodyWithLineCount(n: number): string {
  return Array.from({ length: n }, (_, i) => `line-${i + 1}`).join('\n');
}

function renderNoteCard(note: {
  id: string;
  text: string;
  category: string | null;
  createdAt?: string;
  boldFirstLine?: boolean;
}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <TagsNavProvider>
              <NoteCard
                note={note}
                categories={[]}
                onUpdate={vi.fn()}
                onDelete={vi.fn()}
                onAddCategory={vi.fn()}
              />
            </TagsNavProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NoteCard display — read more / show more-less', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show read-more controls when the note has exactly 7 logical lines', () => {
    renderNoteCard({
      id: 'n-7',
      text: bodyWithLineCount(7),
      category: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /show less/i })).toBeNull();
  });

  it('shows a faded-style show-more control when the note has more than 7 logical lines', () => {
    const body = bodyWithLineCount(8);
    renderNoteCard({
      id: 'n-8',
      text: body,
      category: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const more = screen.getByRole('button', { name: /show more/i });
    expect(more).toBeInTheDocument();
    expect(more.className).toMatch(/opacity-80/);
    expect(more.className).toMatch(/absolute/);
    expect(more.querySelector('svg')).toBeTruthy();
  });

  it('expands full body on show more and returns to collapsed with show less', async () => {
    const user = userEvent.setup();
    const body = bodyWithLineCount(10);
    renderNoteCard({
      id: 'n-10',
      text: body,
      category: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(screen.getByText('line-8')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show more/i }));

    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
    expect(screen.getByText('line-10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show less/i }));

    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show less/i })).toBeNull();
  });
});

describe('NoteCard display — bold first line spacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds margin under the first line when bold-first is on and there is a second line', () => {
    renderNoteCard({
      id: 'n-bold-multi',
      text: 'Title line\nsecond line',
      category: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      boldFirstLine: true,
    });
    const title = screen.getByText('Title line');
    expect(title.closest('[class*="mb-1.5"]')).toBeInTheDocument();
  });

  it('does not add bold-first margin when only one line exists', () => {
    renderNoteCard({
      id: 'n-bold-one',
      text: 'Solo title',
      category: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      boldFirstLine: true,
    });
    const title = screen.getByText('Solo title');
    expect(title.closest('[class*="mb-1.5"]')).toBeNull();
  });

  it('does not add bold-first margin when bold-first is off even with two lines', () => {
    renderNoteCard({
      id: 'n-plain-multi',
      text: 'First\nSecond',
      category: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      boldFirstLine: false,
    });
    const first = screen.getByText('First');
    expect(first.closest('[class*="mb-1.5"]')).toBeNull();
  });
});
