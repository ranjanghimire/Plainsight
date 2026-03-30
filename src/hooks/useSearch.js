export function useSearch(notes, searchQuery) {
  const filtered =
    !searchQuery || !searchQuery.trim()
      ? notes
      : notes.filter((note) =>
          (note.text || '')
            .toLowerCase()
            .includes(searchQuery.trim().toLowerCase())
        );
  return filtered;
}
