import { Link } from "react-router";
import { Status } from "@ieum/ui";
import type { EventItem } from "../../entities/events/api";
import {
  addDays,
  addMonths,
  dateInZone,
  eachDate,
  formatDateOnly,
  formatTimeOnly,
  monthStart,
} from "../../shared/time";

export function eventDates(event: EventItem, viewZone: string): string[] {
  const { schedule } = event;
  if (schedule.kind === "ALL_DAY")
    return eachDate(schedule.startDate, schedule.endDateExclusive);
  const first = dateInZone(Date.parse(schedule.startAt), viewZone);
  // The end instant is exclusive, so the last covered day contains the instant before it.
  const last = dateInZone(Date.parse(schedule.endAt) - 1, viewZone);
  return eachDate(first, addDays(last, 1));
}

/** Short text shown next to a title, in the viewer's zone. */
export function eventTimeText(event: EventItem, viewZone: string): string {
  const { schedule } = event;
  if (schedule.kind === "ALL_DAY") return "종일";
  const zoneNote =
    schedule.timeZone === viewZone ? "" : ` (${schedule.timeZone} 기준 일정)`;
  return `${formatTimeOnly(schedule.startAt, viewZone)}–${formatTimeOnly(schedule.endAt, viewZone)}${zoneNote}`;
}

/** The visible grid: whole weeks, Sunday first, covering the month. */
export function gridRange(month: string): {
  from: string;
  toExclusive: string;
} {
  const first = monthStart(month);
  const startWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const nextMonth = addMonths(first, 1);
  const lastDay = addDays(nextMonth, -1);
  const endWeekday = new Date(`${lastDay}T00:00:00Z`).getUTCDay();
  return {
    from: addDays(first, -startWeekday),
    toExclusive: addDays(lastDay, 7 - endWeekday),
  };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function MonthGrid({
  month,
  events,
  viewZone,
  today,
}: {
  month: string;
  events: EventItem[];
  viewZone: string;
  today: string;
}) {
  const { from, toExclusive } = gridRange(month);
  const days = eachDate(from, toExclusive);
  const byDate = new Map<string, EventItem[]>();
  for (const event of events)
    for (const date of eventDates(event, viewZone))
      byDate.set(date, [...(byDate.get(date) ?? []), event]);
  const weeks: string[][] = [];
  for (let index = 0; index < days.length; index += 7)
    weeks.push(days.slice(index, index + 7));
  return (
    <div className="ieum-table-wrap">
      <table className="ieum-table" aria-label="월간 일정">
        <thead>
          <tr>
            {WEEKDAYS.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((date) => {
                const inMonth = date.slice(0, 7) === month.slice(0, 7);
                const items = byDate.get(date) ?? [];
                return (
                  <td
                    key={date}
                    data-date={date}
                    aria-current={date === today ? "date" : undefined}
                  >
                    <Link
                      to={`/calendar/new?date=${date}`}
                      aria-label={`${formatDateOnly(date)} 일정 추가`}
                      className={inMonth ? undefined : "ieum-help"}
                    >
                      {Number(date.slice(8))}
                    </Link>
                    <ul className="ieum-list" aria-label={`${date} 일정`}>
                      {items.map((event) => (
                        <li key={event.id}>
                          <Link
                            to={`/calendar/events/${event.id}`}
                            className="ieum-break"
                          >
                            {event.state === "CANCELED" ? "(취소) " : ""}
                            {event.schedule.kind === "TIMED"
                              ? `${formatTimeOnly(event.schedule.startAt, viewZone)} `
                              : ""}
                            {event.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Agenda({
  month,
  events,
  viewZone,
}: {
  month: string;
  events: EventItem[];
  viewZone: string;
}) {
  const byDate = new Map<string, EventItem[]>();
  for (const event of events)
    for (const date of eventDates(event, viewZone))
      if (date.slice(0, 7) === month.slice(0, 7))
        byDate.set(date, [...(byDate.get(date) ?? []), event]);
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0)
    return <p className="ieum-help">이 달에는 일정이 없습니다.</p>;
  const byId = new Map(events.map((event) => [event.id, event]));
  return (
    <ul className="ieum-list" aria-label="일정 목록">
      {dates.map((date) => (
        <li key={date} className="ieum-list-item">
          <div>
            <h3>{formatDateOnly(date)}</h3>
            <ul className="ieum-list">
              {byDate.get(date)!.map((event) => (
                <li key={event.id}>
                  <Link
                    to={`/calendar/events/${event.id}`}
                    className="ieum-break"
                  >
                    {event.title}
                  </Link>{" "}
                  <span className="ieum-help">
                    {eventTimeText(event, viewZone)}
                  </span>{" "}
                  {event.state === "CANCELED" && <Status>취소됨</Status>}
                  {event.overlappingEventIds.length > 0 && (
                    <Status tone="warning">
                      겹침:{" "}
                      {event.overlappingEventIds
                        .map((id) => byId.get(id)?.title ?? "다른 일정")
                        .join(", ")}
                    </Status>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
