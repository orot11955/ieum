/** Wall-clock and zone arithmetic without a date library. All zones are IANA names. */

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone.length > 0 && zone.length <= 100;
  } catch {
    return false;
  }
}

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let found = formatters.get(zone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, found);
  }
  return found;
}

function partsAt(instantMs: number, zone: string): Parts {
  const out: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(new Date(instantMs)))
    if (part.type !== "literal") out[part.type] = Number(part.value);
  return out as unknown as Parts;
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function localString(parts: Parts): string {
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function parseLocal(local: string): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    local,
  );
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const parts = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: Number(s ?? 0),
  };
  const check = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
  return check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() === parts.month - 1 &&
    check.getUTCDate() === parts.day &&
    parts.hour < 24 &&
    parts.minute < 60 &&
    parts.second < 60
    ? parts
    : null;
}

function naiveMs(parts: Parts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/** Offset from UTC, in minutes, that the zone has at an instant. */
export function offsetAt(instantMs: number, zone: string): number {
  const wall = naiveMs(partsAt(instantMs, zone));
  return Math.round((wall - Math.floor(instantMs / 1000) * 1000) / 60_000);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export type LocalResolution =
  | { kind: "invalid" }
  | { kind: "gap" }
  | { kind: "unique"; at: string; offsetMinutes: number }
  | { kind: "ambiguous"; options: { at: string; offsetMinutes: number }[] };

/**
 * Finds which instants a local wall time names in a zone: none (skipped by a
 * clock change), one, or two (repeated when clocks go back).
 */
export function resolveLocal(local: string, zone: string): LocalResolution {
  const parts = parseLocal(local);
  if (!parts || !isValidTimeZone(zone)) return { kind: "invalid" };
  const naive = naiveMs(parts);
  const sample = new Set<number>();
  for (const hours of [-36, -24, -12, -6, 0, 6, 12, 24, 36])
    sample.add(offsetAt(naive + hours * 3_600_000, zone));
  const options = [...sample]
    .map((offset) => ({ offset, instant: naive - offset * 60_000 }))
    .filter(
      ({ instant }) =>
        localString(partsAt(instant, zone)) === localString(parts),
    )
    .sort((a, b) => a.instant - b.instant)
    .map(({ offset, instant }) => ({
      at: new Date(instant).toISOString(),
      offsetMinutes: offset,
    }));
  if (options.length === 0) return { kind: "gap" };
  if (options.length === 1) return { kind: "unique", ...options[0]! };
  return { kind: "ambiguous", options };
}

/** The wall clock of an instant in a zone, as `YYYY-MM-DDTHH:mm`. */
export function instantToLocalInput(iso: string, zone: string): string {
  return localString(partsAt(Date.parse(iso), zone)).slice(0, 16);
}

export function dateInZone(instantMs: number, zone: string): string {
  return localString(partsAt(instantMs, zone)).slice(0, 10);
}

export function todayInZone(zone: string): string {
  return dateInZone(Date.now(), zone);
}

export function formatInstant(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatTimeOnly(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatDateOnly(date: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Calendar-date arithmetic on `YYYY-MM-DD`, independent of any zone. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(monthDate: string, months: number): string {
  const moved = new Date(`${monthStart(monthDate)}T00:00:00Z`);
  moved.setUTCMonth(moved.getUTCMonth() + months);
  return moved.toISOString().slice(0, 10);
}

export function isDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

/** Days from `from` (inclusive) to `to` (exclusive), as dates. */
export function eachDate(from: string, toExclusive: string): string[] {
  const days: string[] = [];
  for (let day = from; day < toExclusive; day = addDays(day, 1)) days.push(day);
  return days;
}
