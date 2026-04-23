function localCalendarYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Note timestamps (local): "Today, HH:MM" / "Yesterday, HH:MM" when applicable;
 * otherwise MM/DD/YYYY, HH:MM (24-hour).
 */
export function formatNoteDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const dYmd = localCalendarYmd(d);
  const todayYmd = localCalendarYmd(now);
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayYmd = localCalendarYmd(yesterdayStart);

  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const time = `${HH}:${MM}`;

  if (dYmd === todayYmd) return `Today, ${time}`;
  if (dYmd === yesterdayYmd) return `Yesterday, ${time}`;

  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}, ${time}`;
}
