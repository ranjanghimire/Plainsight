/** Short note timestamp: MM/DD/YYYY, HH:MM (24-hour, local). */
export function formatNoteDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy}, ${HH}:${MM}`;
}
