/** Shows an instant in the user's own time zone; falls back to the browser's. */
export function formatDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return date.toLocaleString("ko-KR");
  }
}
