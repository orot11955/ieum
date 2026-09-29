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
import { isDate, isValidTimeZone } from "../../shared/time";
import type { ContextSummary } from "../../entities/contexts/api";
import {
  classifyTaskError,
  taskFailureMessage,
  type TaskDetail,
  type TaskFields,
} from "../../entities/tasks/api";
import {
  LocalTimeField,
  resolveChoice,
  TimeZoneList,
} from "../time/local-time-field";

export const TaskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(300, "제목은 300자까지 입력할 수 있습니다."),
  description: z.string().max(10000, "설명은 10,000자까지 입력할 수 있습니다."),
  dueKind: z.enum(["NONE", "DATE", "INSTANT"]),
  dueDate: z.string(),
  dueLocal: z.string(),
  dueOffset: z.string(),
  dueZone: z.string(),
  contextId: z.string(),
});
export type TaskFormValues = z.infer<typeof TaskFormSchema>;

type Converted =
  | { ok: true; fields: TaskFields }
  | { ok: false; field: keyof TaskFormValues; message: string };

export function toTaskFields(values: TaskFormValues): Converted {
  const base = {
    title: values.title.trim(),
    description: values.description,
    contextId: values.contextId || null,
  };
  if (values.dueKind === "NONE")
    return { ok: true, fields: { ...base, due: { kind: "NONE" } } };
  if (values.dueKind === "DATE") {
    if (!isDate(values.dueDate))
      return { ok: false, field: "dueDate", message: "날짜를 선택해 주세요." };
    return {
      ok: true,
      fields: { ...base, due: { kind: "DATE", date: values.dueDate } },
    };
  }
  if (!isValidTimeZone(values.dueZone))
    return { ok: false, field: "dueZone", message: "시간대를 확인해 주세요." };
  const resolved = resolveChoice(
    values.dueLocal,
    values.dueZone,
    values.dueOffset,
  );
  if (!resolved.ok)
    return { ok: false, field: "dueLocal", message: resolved.message };
  return {
    ok: true,
    fields: {
      ...base,
      due: { kind: "INSTANT", at: resolved.at, timeZone: values.dueZone },
    },
  };
}

export function TaskForm({
  initial,
  contexts,
  submitLabel,
  save,
  onSaved,
  onCancel,
  refetchLatest,
  requireChange = false,
}: {
  initial: TaskFormValues;
  contexts: ContextSummary[];
  submitLabel: string;
  save: (fields: TaskFields, idempotencyKey: string) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
  refetchLatest?: (() => Promise<TaskDetail | undefined>) | undefined;
  requireChange?: boolean;
}) {
  const key = useIdempotencyKey();
  const [failure, setFailure] = useState("");
  const [latest, setLatest] = useState<TaskDetail | null>(null);
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(TaskFormSchema),
    defaultValues: initial,
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const guard = useDirtyGuard(isDirty);
  const values = form.watch();
  const set = (name: keyof TaskFormValues, value: string) =>
    form.setValue(name, value, { shouldDirty: true, shouldValidate: false });
  const selectable = contexts.filter(
    (context) =>
      (context.state === "ACTIVE" && context.kind === "PROJECT") ||
      context.id === initial.contextId,
  );
  return (
    <>
      <UnsavedGuard isDirty={guard.isDirty} />
      <TimeZoneList id="task-zones" />
      <form
        noValidate
        onSubmit={form.handleSubmit(async (submitted) => {
          setFailure("");
          const converted = toTaskFields(submitted);
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
            const kind = classifyTaskError(error);
            if (kind === "conflict" && refetchLatest)
              setLatest((await refetchLatest().catch(() => undefined)) ?? null);
            setFailure(taskFailureMessage[kind]);
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
          <TextArea
            label="설명"
            rows={4}
            error={errors.description?.message}
            {...form.register("description")}
          />
          <Select label="기한" {...form.register("dueKind")}>
            <option value="NONE">기한 없음</option>
            <option value="DATE">날짜만</option>
            <option value="INSTANT">날짜와 시각</option>
          </Select>
          {values.dueKind === "DATE" && (
            <Field
              label="기한 날짜"
              type="date"
              error={errors.dueDate?.message}
              {...form.register("dueDate")}
            />
          )}
          {values.dueKind === "INSTANT" && (
            <>
              <Field
                label="기한 시간대"
                list="task-zones"
                autoComplete="off"
                help="예: Asia/Seoul, America/New_York"
                error={errors.dueZone?.message}
                {...form.register("dueZone")}
              />
              <LocalTimeField
                label="기한 시각"
                value={values.dueLocal}
                zone={values.dueZone}
                offset={values.dueOffset}
                onChange={(value) => set("dueLocal", value)}
                onOffsetChange={(value) => set("dueOffset", value)}
                error={errors.dueLocal?.message}
              />
            </>
          )}
          <Select
            label="맥락"
            help="할일은 진행 중인 '프로젝트' 종류의 맥락에만 연결할 수 있습니다."
            {...form.register("contextId")}
          >
            <option value="">맥락 없음</option>
            {selectable.map((context) => (
              <option key={context.id} value={context.id}>
                {context.name}
                {context.state === "ACTIVE" ? "" : " (보관됨)"}
              </option>
            ))}
          </Select>
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
