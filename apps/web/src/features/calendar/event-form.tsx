import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Button,
  Card,
  Cluster,
  Field,
  Notice,
  Select,
  Stack,
  TextArea,
} from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import { UnsavedGuard, useDirtyGuard } from "../../shared/unsaved-guard";
import { addDays, isDate, isValidTimeZone } from "../../shared/time";
import {
  classifyEventError,
  eventFailureMessage,
  type EventDetail,
  type EventScheduleInput,
} from "../../entities/events/api";
import {
  LocalTimeField,
  resolveChoice,
  TimeZoneList,
  withSeconds,
} from "../time/local-time-field";

export const EventFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(300, "제목은 300자까지 입력할 수 있습니다."),
  description: z.string().max(10000, "설명은 10,000자까지 입력할 수 있습니다."),
  kind: z.enum(["TIMED", "ALL_DAY"]),
  zone: z.string(),
  startLocal: z.string(),
  startOffset: z.string(),
  endLocal: z.string(),
  endOffset: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});
export type EventFormValues = z.infer<typeof EventFormSchema>;

export type EventFields = {
  title: string;
  description: string;
  schedule: EventScheduleInput;
};

type Converted =
  | { ok: true; fields: EventFields }
  | { ok: false; field: keyof EventFormValues; message: string };

export function toEventFields(values: EventFormValues): Converted {
  const head = { title: values.title.trim(), description: values.description };
  if (!isValidTimeZone(values.zone))
    return { ok: false, field: "zone", message: "시간대를 확인해 주세요." };
  if (values.kind === "ALL_DAY") {
    if (!isDate(values.startDate))
      return {
        ok: false,
        field: "startDate",
        message: "시작 날짜를 선택해 주세요.",
      };
    if (!isDate(values.endDate))
      return {
        ok: false,
        field: "endDate",
        message: "끝 날짜를 선택해 주세요.",
      };
    if (values.endDate < values.startDate)
      return {
        ok: false,
        field: "endDate",
        message: "끝 날짜는 시작 날짜보다 빠를 수 없습니다.",
      };
    return {
      ok: true,
      fields: {
        ...head,
        schedule: {
          kind: "ALL_DAY",
          timeZone: values.zone,
          startDate: values.startDate,
          endDateExclusive: addDays(values.endDate, 1),
        },
      },
    };
  }
  const start = resolveChoice(
    values.startLocal,
    values.zone,
    values.startOffset,
  );
  if (!start.ok)
    return { ok: false, field: "startLocal", message: start.message };
  const end = resolveChoice(values.endLocal, values.zone, values.endOffset);
  if (!end.ok) return { ok: false, field: "endLocal", message: end.message };
  if (Date.parse(end.at) <= Date.parse(start.at))
    return {
      ok: false,
      field: "endLocal",
      message: "끝나는 시각은 시작보다 뒤여야 합니다.",
    };
  return {
    ok: true,
    fields: {
      ...head,
      schedule: {
        kind: "TIMED",
        timeZone: values.zone,
        startLocal: withSeconds(values.startLocal),
        endLocal: withSeconds(values.endLocal),
        ...(start.explicitOffset === undefined
          ? {}
          : { startOffsetMinutes: start.explicitOffset }),
        ...(end.explicitOffset === undefined
          ? {}
          : { endOffsetMinutes: end.explicitOffset }),
      },
    },
  };
}

export function eventFormFromDetail(event: EventDetail): EventFormValues {
  const base: EventFormValues = {
    title: event.title,
    description: event.description,
    kind: "ALL_DAY",
    zone: event.schedule.timeZone,
    startLocal: "",
    startOffset: "",
    endLocal: "",
    endOffset: "",
    startDate: "",
    endDate: "",
  };
  if (event.schedule.kind === "ALL_DAY")
    return {
      ...base,
      startDate: event.schedule.startDate,
      endDate: addDays(event.schedule.endDateExclusive, -1),
    };
  return {
    ...base,
    kind: "TIMED",
    startLocal: event.schedule.startLocal.slice(0, 16),
    startOffset: String(event.schedule.startOffsetMinutes),
    endLocal: event.schedule.endLocal.slice(0, 16),
    endOffset: String(event.schedule.endOffsetMinutes),
  };
}

export function EventForm({
  initial,
  submitLabel,
  save,
  onSaved,
  onCancel,
  refetchLatest,
  requireChange = false,
}: {
  initial: EventFormValues;
  submitLabel: string;
  save: (fields: EventFields, idempotencyKey: string) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
  refetchLatest?: (() => Promise<EventDetail | undefined>) | undefined;
  requireChange?: boolean;
}) {
  const key = useIdempotencyKey();
  const [failure, setFailure] = useState("");
  const [latest, setLatest] = useState<EventDetail | null>(null);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema),
    defaultValues: initial,
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const guard = useDirtyGuard(isDirty);
  const values = form.watch();
  const set = (name: keyof EventFormValues, value: string) =>
    form.setValue(name, value, { shouldDirty: true, shouldValidate: false });
  return (
    <>
      <UnsavedGuard isDirty={guard.isDirty} />
      <TimeZoneList id="event-zones" />
      <form
        noValidate
        onSubmit={form.handleSubmit(async (submitted) => {
          setFailure("");
          const converted = toEventFields(submitted);
          if (!converted.ok) {
            form.setError(converted.field, { message: converted.message });
            return;
          }
          try {
            await save(
              converted.fields,
              key.keyFor(JSON.stringify(converted.fields)),
            );
            guard.markSaved();
            key.reset();
            onSaved();
          } catch (error) {
            const kind = classifyEventError(error);
            if (kind === "conflict" && refetchLatest)
              setLatest((await refetchLatest().catch(() => undefined)) ?? null);
            setFailure(eventFailureMessage[kind]);
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          {latest && (
            <Card title="서버의 최신 내용">
              <p className="ieum-help">
                작성 중인 내용은 그대로 두었습니다. 비교한 뒤 최신 버전 위에
                저장하거나 취소할 수 있습니다.
              </p>
              <p className="ieum-break" data-testid="latest-title">
                {latest.title}
              </p>
            </Card>
          )}
          <Field
            label="제목"
            autoComplete="off"
            error={errors.title?.message}
            {...form.register("title")}
          />
          <Select label="종류" {...form.register("kind")}>
            <option value="TIMED">시간 지정</option>
            <option value="ALL_DAY">종일</option>
          </Select>
          <Field
            label="시간대"
            list="event-zones"
            autoComplete="off"
            help="예: Asia/Seoul, America/New_York. 일정은 이 시간대의 시계 기준으로 저장됩니다."
            error={errors.zone?.message}
            {...form.register("zone")}
          />
          {values.kind === "TIMED" ? (
            <>
              <LocalTimeField
                label="시작"
                value={values.startLocal}
                zone={values.zone}
                offset={values.startOffset}
                onChange={(value) => set("startLocal", value)}
                onOffsetChange={(value) => set("startOffset", value)}
                error={errors.startLocal?.message}
              />
              <LocalTimeField
                label="끝"
                value={values.endLocal}
                zone={values.zone}
                offset={values.endOffset}
                onChange={(value) => set("endLocal", value)}
                onOffsetChange={(value) => set("endOffset", value)}
                error={errors.endLocal?.message}
              />
            </>
          ) : (
            <>
              <Field
                label="시작 날짜"
                type="date"
                error={errors.startDate?.message}
                {...form.register("startDate")}
              />
              <Field
                label="끝 날짜"
                type="date"
                help="끝 날짜를 포함해 종일로 표시됩니다."
                error={errors.endDate?.message}
                {...form.register("endDate")}
              />
            </>
          )}
          <TextArea
            label="설명"
            rows={4}
            error={errors.description?.message}
            {...form.register("description")}
          />
          <Cluster>
            <Button
              type="submit"
              intent="primary"
              busy={isSubmitting}
              disabled={requireChange && !isDirty && !latest}
              disabledReason={
                requireChange && !isDirty && !latest
                  ? "바뀐 내용이 없습니다."
                  : undefined
              }
            >
              {latest ? "최신 버전 위에 저장" : submitLabel}
            </Button>
            <Button onClick={onCancel}>취소</Button>
          </Cluster>
        </Stack>
      </form>
    </>
  );
}
