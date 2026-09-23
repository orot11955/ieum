export type CalendarTimeErrorCode =
  | "INVALID_DATE"
  | "INVALID_LOCAL_TIME"
  | "INVALID_TIME_ZONE"
  | "NONEXISTENT_LOCAL_TIME"
  | "AMBIGUOUS_LOCAL_TIME"
  | "OFFSET_MISMATCH";
export class CalendarTimeError extends Error {
  constructor(public readonly code: CalendarTimeErrorCode) {
    super(code);
  }
}
interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}
const datePattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const localPattern =
  /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
function epoch(parts: Parts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}
export function validCalendarDate(value: string): boolean {
  if (!datePattern.test(value) || value.startsWith("0000")) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined)
    return false;
  const date = new Date(
    epoch({ year, month, day, hour: 0, minute: 0, second: 0 }),
  );
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function dateAfter(value: string): string {
  if (!validCalendarDate(value)) throw new CalendarTimeError("INVALID_DATE");
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function timeZoneFormat(timeZone: string): Intl.DateTimeFormat {
  if (
    typeof timeZone !== "string" ||
    timeZone.length < 1 ||
    timeZone.length > 100 ||
    (timeZone !== "UTC" &&
      !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(timeZone))
  )
    throw new CalendarTimeError("INVALID_TIME_ZONE");
  try {
    return new Intl.DateTimeFormat("en-US-u-hc-h23", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new CalendarTimeError("INVALID_TIME_ZONE");
  }
}
function partsAt(format: Intl.DateTimeFormat, instant: number): Parts {
  const values = Object.fromEntries(
    format
      .formatToParts(new Date(instant))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!,
  };
}
function localParts(value: string): Parts {
  const match = localPattern.exec(value);
  if (!match || !validCalendarDate(match[1]!))
    throw new CalendarTimeError("INVALID_LOCAL_TIME");
  const [year, month, day] = match[1]!.split("-").map(Number);
  const hour = Number(match[2]),
    minute = Number(match[3]),
    second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59)
    throw new CalendarTimeError("INVALID_LOCAL_TIME");
  return { year: year!, month: month!, day: day!, hour, minute, second };
}
function same(a: Parts, b: Parts): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}
function offsets(format: Intl.DateTimeFormat, naive: number): number[] {
  const values = new Set<number>();
  for (let delta = -48; delta <= 48; delta += 6) {
    const instant = naive + delta * 3_600_000;
    values.add(epoch(partsAt(format, instant)) - instant);
  }
  return [...values];
}
function candidates(
  parts: Parts,
  format: Intl.DateTimeFormat,
  possibleOffsets: number[],
): Array<{ at: string; offsetMinutes: number }> {
  const naive = epoch(parts);
  return possibleOffsets
    .map((offset) => ({ instant: naive - offset, offset }))
    .filter(({ instant }) => same(partsAt(format, instant), parts))
    .sort((a, b) => a.instant - b.instant)
    .map(({ instant, offset }) => ({
      at: new Date(instant).toISOString(),
      offsetMinutes: offset / 60_000,
    }));
}
export function resolveLocalTime(
  local: string,
  timeZone: string,
  offsetMinutes?: number,
): { at: string; offsetMinutes: number } {
  const parts = localParts(local),
    format = timeZoneFormat(timeZone),
    matches = candidates(parts, format, offsets(format, epoch(parts)));
  if (matches.length === 0)
    throw new CalendarTimeError("NONEXISTENT_LOCAL_TIME");
  if (offsetMinutes !== undefined) {
    if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 1440)
      throw new CalendarTimeError("OFFSET_MISMATCH");
    const chosen = matches.find(
      (match) => match.offsetMinutes === offsetMinutes,
    );
    if (!chosen) throw new CalendarTimeError("OFFSET_MISMATCH");
    return chosen;
  }
  if (matches.length > 1) throw new CalendarTimeError("AMBIGUOUS_LOCAL_TIME");
  return matches[0]!;
}
export function startOfLocalDate(value: string, timeZone: string): string {
  if (!validCalendarDate(value)) throw new CalendarTimeError("INVALID_DATE");
  const format = timeZoneFormat(timeZone),
    [year, month, day] = value.split("-").map(Number);
  const initial = {
      year: year!,
      month: month!,
      day: day!,
      hour: 0,
      minute: 0,
      second: 0,
    },
    possible = offsets(format, epoch(initial));
  for (let minuteOfDay = 0; minuteOfDay <= 1440; minuteOfDay++) {
    const instant = epoch(initial) + minuteOfDay * 60_000;
    const date = new Date(instant);
    const parts = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: 0,
    };
    const found = candidates(parts, format, possible)[0];
    if (found) return found.at;
  }
  throw new CalendarTimeError("NONEXISTENT_LOCAL_TIME");
}
export function localAt(instant: string, timeZone: string): string {
  const format = timeZoneFormat(timeZone),
    parts = partsAt(format, Date.parse(instant));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}
