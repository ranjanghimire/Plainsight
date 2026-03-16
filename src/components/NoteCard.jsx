import { useState } from 'react';
import { CategoryDropdown } from './CategoryDropdown';

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export function NoteCard({
  note,
  categories,
  onUpdate,
  onDelete,
  onAddCategory,
  defaultCategory,
}) {
  const [text, setText] = useState(note.text);
  const [isEditing, setIsEditing] = useState(false);

  const commitText = () => {
    if (text !== note.text) onUpdate(note.id, { text });
    setIsEditing(false);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-600 dark:bg-stone-800">
      {isEditing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            }
          }}
          className="w-full min-h-[80px] px-2 py-1.5 text-stone-800 bg-stone-50 rounded border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-200"
          autoFocus
        />
      ) : (
        <p
          onClick={() => setIsEditing(true)}
          className="text-stone-700 dark:text-stone-300 whitespace-pre-wrap cursor-text min-h-[1.5em]"
        >
          {text || 'Click to edit…'}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <CategoryDropdown
          categories={categories}
          currentCategory={note.category}
          onSelect={(cat) => onUpdate(note.id, { category: cat })}
          onAddNew={onAddCategory}
          triggerLabel="+Add category"
        />
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="p-1.5 text-stone-400 hover:text-red-600 dark:hover:text-red-400"
          aria-label="Delete note"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
