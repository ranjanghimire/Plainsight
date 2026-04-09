import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { useTagsNav } from '../context/TagsNavContext';
import {
  getAllWorkspaceKeys,
  getWorkspaceNameFromKey,
  isKeyInVisibleWorkspacesList,
  isLegacyHiddenWorkspaceKey,
  loadAppState,
  loadWorkspace,
} from '../utils/storage';
import { parseNoteBodyAndTags } from '../utils/noteTags';

function workspaceLabelForKey(key, visibleList) {
  const entry = (visibleList || []).find((e) => e.key === key);
  if (entry?.name) return entry.name;
  return getWorkspaceNameFromKey(key);
}

/** Keys to scan for tags: visible scope = every menu tab (Home + ws_visible_*); hidden = legacy workspace_<slug> blobs only. */
function collectStorageKeysForTagScope(scope, visibleList) {
  const list = Array.isArray(visibleList) ? visibleList : [];
  const seen = new Set();
  const out = [];

  const push = (k) => {
    if (typeof k !== 'string' || !k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };

  if (scope === 'visible') {
    for (const e of list) {
      push(e?.key);
    }
    return out;
  }

  for (const key of getAllWorkspaceKeys()) {
    if (key === 'workspace_home') continue;
    const isVisible = isKeyInVisibleWorkspacesList(key, list);
    const isHidden = !isVisible && isLegacyHiddenWorkspaceKey(key);
    if (isHidden) push(key);
  }
  return out;
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 shrink-0 text-stone-400 dark:text-stone-500 transition-transform duration-200 ease-out ${
        open ? 'rotate-180' : 'rotate-0'
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function TagsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { goBackFromTags, setTagsReturnTo } = useTagsNav();
  const { currentWorkspace, visibleWorkspaces, switchVisibleWorkspace, load } = useWorkspace();
  const [selectedTag, setSelectedTag] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const st = location.state;
    if (st == null || typeof st !== 'object') return;

    const hasExpand = typeof st.expandTag === 'string';
    const hasReturn = st.tagsReturnTo != null && typeof st.tagsReturnTo.pathname === 'string';
    if (!hasExpand && !hasReturn) return;

    if (hasReturn) {
      setTagsReturnTo(st.tagsReturnTo);
    }
    if (hasExpand) {
      const tag = st.expandTag.trim().toLowerCase().replace(/\s+/g, '_');
      if (tag) {
        setSelectedTag(tag);
        setQuery('');
      }
    }

    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: {} });
  }, [
    location.state,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    setTagsReturnTo,
  ]);

  const scope = useMemo(() => {
    if (currentWorkspace === 'home') return 'visible';
    if (typeof currentWorkspace === 'string' && currentWorkspace.startsWith('visible:')) {
      return 'visible';
    }
    return 'hidden';
  }, [currentWorkspace]);

  const scopedNotes = useMemo(() => {
    const app = loadAppState();
    const visibleList = app.visibleWorkspaces || visibleWorkspaces || [];
    const keys = collectStorageKeysForTagScope(scope, visibleList);
    const out = [];
    for (const key of keys) {
      const ws = loadWorkspace(key);
      const notes = Array.isArray(ws?.notes) ? ws.notes : [];
      for (const n of notes) {
        const text = typeof n?.text === 'string' ? n.text : '';
        const { tags, body } = parseNoteBodyAndTags(text);
        out.push({
          id: String(n?.id || `${key}:${text}`),
          workspaceKey: key,
          workspaceLabel: workspaceLabelForKey(key, visibleList),
          text,
          tags,
          previewBody: body,
        });
      }
    }
    return out;
  }, [scope, visibleWorkspaces]);

  const tags = useMemo(() => {
    const counts = new Map();
    for (const n of scopedNotes) {
      for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const q = query.trim().toLowerCase();
    const rows = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .filter((r) => (!q ? true : r.tag.includes(q)));
    rows.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return rows;
  }, [scopedNotes, query]);

  const notesByTag = useMemo(() => {
    const map = new Map();
    for (const n of scopedNotes) {
      for (const t of n.tags) {
        if (!map.has(t)) map.set(t, []);
        map.get(t).push({
          ...n,
          displayText: n.previewBody || '',
        });
      }
    }
    return map;
  }, [scopedNotes]);

  const toggleTag = (tag) => {
    setSelectedTag((prev) => (prev === tag ? null : tag));
  };

  const filterTrim = query.trim();
  const showTagCountLine = !selectedTag && (tags.length > 0 || filterTrim.length > 0);

  const openWorkspaceForNote = (note) => {
    const app = loadAppState();
    const visibleList = app.visibleWorkspaces || visibleWorkspaces || [];
    const visibleEntry = visibleList.find((e) => e.key === note.workspaceKey);
    if (visibleEntry) {
      switchVisibleWorkspace?.(visibleEntry);
      navigate('/');
      return;
    }
    const slug = getWorkspaceNameFromKey(note.workspaceKey);
    load?.(slug, 'hidden');
    navigate(`/ws/${slug}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-stone-800 dark:text-stone-200">Tags</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Showing {scope === 'visible' ? 'visible' : 'hidden'} workspace tags
          </p>
        </div>
        <button
          type="button"
          onClick={goBackFromTags}
          className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          ← Back
        </button>
      </div>

      <div className="rounded-xl bg-white px-3.5 py-2.5 shadow-sm shadow-stone-200/50 ring-1 ring-stone-200/80 dark:bg-stone-800 dark:shadow-none dark:ring-stone-600/50">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tags…"
          className="w-full bg-transparent text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none"
        />
      </div>

      {showTagCountLine ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {filterTrim ? (
            <>
              Showing {tags.length} tag{tags.length === 1 ? '' : 's'} matching {'\u2018'}
              {filterTrim}
              {'\u2019'}
            </>
          ) : (
            <>Showing {tags.length} tag{tags.length === 1 ? '' : 's'}</>
          )}
        </p>
      ) : null}

      <div className="space-y-2.5">
        {tags.map((t) => {
          const isOpen = selectedTag === t.tag;
          const notesForTag = notesByTag.get(t.tag) ?? [];

          return (
            <div
              key={t.tag}
              className={`rounded-2xl overflow-hidden transition-[box-shadow,background-color] duration-200 ease-out ${
                isOpen
                  ? 'bg-white shadow-md shadow-stone-200/60 ring-1 ring-stone-300/80 dark:bg-stone-800 dark:shadow-black/25 dark:ring-stone-500/40'
                  : 'bg-white shadow-sm shadow-stone-200/40 ring-1 ring-stone-200/70 dark:bg-stone-800/90 dark:shadow-none dark:ring-stone-600/45'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleTag(t.tag)}
                aria-expanded={isOpen}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors duration-200 ${
                  isOpen
                    ? 'bg-stone-50/90 dark:bg-stone-800'
                    : 'hover:bg-stone-50/70 dark:hover:bg-stone-700/35'
                }`}
              >
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">#{t.tag}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-stone-400 dark:text-stone-500 tabular-nums">
                    {t.count}
                  </span>
                  <ChevronIcon open={isOpen} />
                </div>
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={`px-2 pb-2 pt-0 transition-opacity duration-200 ease-out ${
                      isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {notesForTag.length === 0 ? (
                      <p className="text-sm text-stone-500 dark:text-stone-400 px-2 py-3">
                        No notes found for #{t.tag}.
                      </p>
                    ) : (
                      <div className="mx-1 rounded-xl bg-stone-100/90 dark:bg-stone-950/50 overflow-hidden divide-y divide-stone-200/60 dark:divide-stone-600/35">
                        {notesForTag.map((n) => (
                          <button
                            key={`${n.workspaceKey}:${n.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWorkspaceForNote(n);
                            }}
                            className="w-full text-left px-3.5 py-3 bg-white/0 hover:bg-white/95 dark:hover:bg-stone-800/85 active:bg-stone-100/80 dark:active:bg-stone-700/60 transition-colors duration-150"
                          >
                            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-1">
                              {n.workspaceLabel}
                            </div>
                            <div className="text-sm text-stone-800 dark:text-stone-200 whitespace-pre-wrap leading-snug">
                              {n.displayText || '(empty)'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {tags.length === 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400">No tags yet.</p>
        )}
      </div>
    </div>
  );
}
