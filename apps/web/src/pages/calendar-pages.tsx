import { useState, type ReactNode } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, Check, Cluster, Notice, Page, Status } from "@ieum/ui";
import type { ShellContext } from "../app/shell";
import {
  createEvent,
  editEvent,
  eventFailureMessage,
  classifyEventError,
  invalidateEvents,
  setEventState,
  useEvent,
  useEventPeriod,
  type EventDetail,
} from "../entities/events/api";
import { ApiError } from "../shared/api/http";
import { useIdempotencyKey } from "../shared/api/idempotency";
import {
  addMonths,
  formatDateOnly,
  formatInstant,
  isDate,
  monthStart,
  todayInZone,
} from "../shared/time";
import {
  EventForm,
  eventFormFromDetail,
  type EventFormValues,
} from "../features/calendar/event-form";
import { Agenda, gridRange, MonthGrid } from "../features/calendar/month-view";
import { ForbiddenPage, NotFoundPage } from "./app-pages";

function useMonthParam(zone: string): string {
  const raw = useSearchParams()[0].get("month");
  return raw && /^\d{4}-\d{2}$/.test(raw) && isDate(`${raw}-01`)
    ? `${raw}-01`
    : monthStart(todayInZone(zone));
}

export function CalendarPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const zone = me.preferences.timeZone;
  const month = useMonthParam(zone);
  const includeCanceled = params.get("canceled") === "1";
  const range = gridRange(month);
  const period = useEventPeriod(
    me.user.id,
    me.workspace.id,
    range.from,
    range.toExclusive,
    zone,
    includeCanceled,
  );
  const go = (target: string) => {
    const next: Record<string, string> = { month: target.slice(0, 7) };
    if (includeCanceled) next.canceled = "1";
    setParams(next, { replace: true });
  };
  return (
    <Page
      eyebrow="일정"
      title={`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`}
      actions={
        <Button
          intent="primary"
          onClick={() =>
            navigate(
              `/calendar/new?date=${todayInZone(zone).slice(0, 7) === month.slice(0, 7) ? todayInZone(zone) : month}`,
            )
          }
        >
          새 일정
        </Button>
      }
    >
      <Cluster>
        <Button onClick={() => go(addMonths(month, -1))}>이전 달</Button>
        <Button onClick={() => go(monthStart(todayInZone(zone)))}>오늘</Button>
        <Button onClick={() => go(addMonths(month, 1))}>다음 달</Button>
        <Check
          label="취소된 일정도 보기"
          checked={includeCanceled}
          onChange={(event) =>
            setParams(
              event.target.checked
                ? { month: month.slice(0, 7), canceled: "1" }
                : { month: month.slice(0, 7) },
              { replace: true },
            )
          }
        />
      </Cluster>
      <p className="ieum-help">표시 시간대: {zone}</p>
      {period.isPending ? (
        <p role="status">일정을 불러오는 중…</p>
      ) : period.isError ? (
        <Notice tone="danger">
          {period.error instanceof ApiError &&
          period.error.code === "PERIOD_TOO_LARGE"
            ? "이 기간의 일정이 너무 많아 표시할 수 없습니다."
            : "일정을 불러오지 못했습니다."}{" "}
          <Button intent="ghost" onClick={() => void period.refetch()}>
            다시 시도
          </Button>
        </Notice>
      ) : (
        <>
          <MonthGrid
            month={month}
            events={period.data.events}
            viewZone={zone}
            today={todayInZone(zone)}
          />
          <Card title="이 달의 일정">
            <Agenda month={month} events={period.data.events} viewZone={zone} />
          </Card>
        </>
      )}
    </Page>
  );
}

function emptyEventForm(zone: string, date: string): EventFormValues {
  return {
    title: "",
    description: "",
    kind: "TIMED",
    zone,
    startLocal: `${date}T09:00`,
    startOffset: "",
    endLocal: `${date}T10:00`,
    endOffset: "",
    startDate: date,
    endDate: date,
  };
}

export function NewEventPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = me.preferences.timeZone;
  const raw = useSearchParams()[0].get("date") ?? "";
  const date = isDate(raw) ? raw : todayInZone(zone);
  let createdId = "";
  return (
    <Page eyebrow="일정" title="새 일정">
      <Card>
        <EventForm
          initial={emptyEventForm(zone, date)}
          submitLabel="일정 만들기"
          save={async (fields, key) => {
            createdId = (await createEvent(me.workspace.id, fields, key)).id;
            await invalidateEvents(queryClient, me.user.id);
          }}
          onSaved={() =>
            navigate(`/calendar/events/${createdId}`, { replace: true })
          }
          onCancel={() => navigate("/calendar")}
        />
      </Card>
    </Page>
  );
}

function EventLoader({
  children,
}: {
  children: (
    event: EventDetail,
    refetch: () => Promise<EventDetail | undefined>,
  ) => ReactNode;
}) {
  const { me } = useOutletContext<ShellContext>();
  const { id = "" } = useParams();
  const query = useEvent(me.user.id, me.workspace.id, id);
  if (query.isPending) return <p role="status">일정을 불러오는 중…</p>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return <NotFoundPage />;
    if (query.error instanceof ApiError && query.error.status === 403)
      return <ForbiddenPage />;
    return (
      <Notice tone="danger">
        일정을 불러오지 못했습니다.{" "}
        <Button intent="ghost" onClick={() => void query.refetch()}>
          다시 시도
        </Button>
      </Notice>
    );
  }
  return <>{children(query.data, async () => (await query.refetch()).data)}</>;
}

function scheduleText(event: EventDetail, viewZone: string): string[] {
  const { schedule } = event;
  if (schedule.kind === "ALL_DAY") {
    const last = new Date(`${schedule.endDateExclusive}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - 1);
    const lastDate = last.toISOString().slice(0, 10);
    return [
      schedule.startDate === lastDate
        ? `${formatDateOnly(schedule.startDate)} (종일)`
        : `${formatDateOnly(schedule.startDate)} – ${formatDateOnly(lastDate)} (종일)`,
    ];
  }
  const lines = [
    `${formatInstant(schedule.startAt, schedule.timeZone)} – ${formatInstant(schedule.endAt, schedule.timeZone)} (${schedule.timeZone})`,
  ];
  if (schedule.timeZone !== viewZone)
    lines.push(
      `내 시간대(${viewZone}): ${formatInstant(schedule.startAt, viewZone)} – ${formatInstant(schedule.endAt, viewZone)}`,
    );
  return lines;
}

function StateButton({
  event,
  userId,
  workspaceId,
}: {
  event: EventDetail;
  userId: string;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const target = event.state === "CONFIRMED" ? "CANCELED" : "CONFIRMED";
  return (
    <>
      <Button
        intent={target === "CANCELED" ? "danger" : "primary"}
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setFailure("");
          try {
            await setEventState(
              workspaceId,
              event.id,
              { baseVersion: event.version, targetState: target },
              key.keyFor(`${event.id}:${event.version}:${target}`),
            );
            key.reset();
          } catch (error) {
            setFailure(eventFailureMessage[classifyEventError(error)]);
          } finally {
            await invalidateEvents(queryClient, userId);
            setBusy(false);
          }
        }}
      >
        {target === "CANCELED" ? "일정 취소" : "일정 복구"}
      </Button>
      {failure && <Notice tone="warning">{failure}</Notice>}
    </>
  );
}

export function EventDetailPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  return (
    <EventLoader>
      {(event) => (
        <Page
          eyebrow="일정"
          title={event.title}
          actions={
            <>
              <Button
                onClick={() => navigate(`/calendar/events/${event.id}/edit`)}
              >
                수정
              </Button>
              <StateButton
                event={event}
                userId={me.user.id}
                workspaceId={me.workspace.id}
              />
            </>
          }
        >
          <Cluster>
            <Status tone={event.state === "CONFIRMED" ? "success" : "neutral"}>
              {event.state === "CONFIRMED" ? "확정" : "취소됨"}
            </Status>
          </Cluster>
          <Card title="시간">
            {scheduleText(event, me.preferences.timeZone).map((line) => (
              <p key={line} className="ieum-break" data-testid="event-time">
                {line}
              </p>
            ))}
          </Card>
          {event.description && (
            <Card title="설명">
              <p className="ieum-break">{event.description}</p>
            </Card>
          )}
          <Link to="/calendar">월간 일정으로</Link>
        </Page>
      )}
    </EventLoader>
  );
}

export function EventEditPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <EventLoader>
      {(event, refetch) => (
        <Page eyebrow="일정" title="일정 수정">
          <Card>
            <EventForm
              initial={eventFormFromDetail(event)}
              submitLabel="저장"
              requireChange
              refetchLatest={refetch}
              save={async (fields, key) => {
                await editEvent(
                  me.workspace.id,
                  event.id,
                  { baseVersion: event.version, ...fields },
                  key,
                );
                await invalidateEvents(queryClient, me.user.id);
              }}
              onSaved={() =>
                navigate(`/calendar/events/${event.id}`, { replace: true })
              }
              onCancel={() => navigate(`/calendar/events/${event.id}`)}
            />
          </Card>
        </Page>
      )}
    </EventLoader>
  );
}
