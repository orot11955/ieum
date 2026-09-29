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
import {
  classifyContextError,
  contextFailureMessage,
  kindLabel,
  type ContextDetail,
  type ContextKind,
} from "../../entities/contexts/api";

const KINDS = ["TOPIC", "FLOW", "PROJECT", "COLLECTION"] as const;

export const ContextFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(200, "이름은 200자까지 입력할 수 있습니다."),
  purpose: z
    .string()
    .trim()
    .min(1, "왜 함께 보는지 적어 주세요.")
    .max(2000, "2000자까지 입력할 수 있습니다."),
  scope: z
    .string()
    .trim()
    .min(1, "무엇을 다루고 무엇은 제외하는지 적어 주세요.")
    .max(2000, "2000자까지 입력할 수 있습니다."),
  kind: z.enum(KINDS),
});
export type ContextFields = z.infer<typeof ContextFieldsSchema>;

/**
 * Shared by create and edit. On a version conflict the typed values stay, the
 * latest server values are shown, and the next save is explicitly made on top.
 */
export function ContextForm({
  initial,
  submitLabel,
  save,
  onSaved,
  onCancel,
  refetchLatest,
  requireChange = false,
}: {
  initial: ContextFields;
  submitLabel: string;
  /** Edit mode: nothing to save until a value differs from the loaded one. */
  requireChange?: boolean;
  save: (values: ContextFields, idempotencyKey: string) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
  refetchLatest?: (() => Promise<ContextDetail | undefined>) | undefined;
}) {
  const key = useIdempotencyKey();
  const [failure, setFailure] = useState("");
  const [latest, setLatest] = useState<ContextDetail | null>(null);
  const form = useForm<ContextFields>({
    resolver: zodResolver(ContextFieldsSchema),
    defaultValues: initial,
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const guard = useDirtyGuard(isDirty);
  return (
    <>
      <UnsavedGuard isDirty={guard.isDirty} />
      <form
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setFailure("");
          try {
            await save(values, key.keyFor(JSON.stringify(values)));
            guard.markSaved();
            key.reset();
            onSaved();
          } catch (error) {
            const kind = classifyContextError(error);
            if (kind === "conflict" && refetchLatest)
              setLatest((await refetchLatest().catch(() => undefined)) ?? null);
            setFailure(contextFailureMessage[kind]);
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          {latest && (
            <Card
              title={`서버의 최신 내용 (revision ${latest.identityRevision})`}
            >
              <p className="ieum-help">
                작성 중인 내용은 그대로 두었습니다. 비교한 뒤 최신 버전 위에
                저장하거나 취소할 수 있습니다.
              </p>
              <p className="ieum-break" data-testid="latest-name">
                {latest.name}
              </p>
              <p className="ieum-break">{latest.purpose}</p>
              <p className="ieum-break">{latest.scope}</p>
            </Card>
          )}
          <Field
            label="이름"
            autoComplete="off"
            error={errors.name?.message}
            {...form.register("name")}
          />
          <Select
            label="종류"
            help="종류는 분류용 표시일 뿐 동작이 달라지지 않습니다."
            error={errors.kind?.message}
            {...form.register("kind")}
          >
            {KINDS.map((kind: ContextKind) => (
              <option key={kind} value={kind}>
                {kindLabel[kind]}
              </option>
            ))}
          </Select>
          <TextArea
            label="목적"
            rows={3}
            help="이 맥락으로 기록을 함께 보는 이유입니다."
            error={errors.purpose?.message}
            {...form.register("purpose")}
          />
          <TextArea
            label="범위"
            rows={3}
            help="무엇을 다루고 무엇은 다루지 않는지 적어 두면 나중에 판단하기 쉽습니다."
            error={errors.scope?.message}
            {...form.register("scope")}
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
