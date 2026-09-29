import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Cluster,
  Field,
  Notice,
  Stack,
  TextArea,
} from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import {
  captureFailureMessage,
  classifyCaptureError,
  invalidateCaptures,
  reviseCapture,
  type CaptureDetail,
} from "../../entities/captures/api";
import {
  byteLength,
  CaptureFieldsSchema,
  type CaptureFields,
} from "./capture-fields";
import { UnsavedGuard, useDirtyGuard } from "../../shared/unsaved-guard";

/**
 * Saves a new revision on top of the version the user last saw. If someone else
 * changed the capture first, the draft stays in the form, the latest server text
 * is shown for comparison, and the next save is explicitly made on top of it.
 */
export function ReviseCaptureForm({
  userId,
  workspaceId,
  capture,
  onRefetch,
  onSaved,
  onCancel,
}: {
  userId: string;
  workspaceId: string;
  capture: CaptureDetail;
  onRefetch: () => Promise<CaptureDetail | undefined>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const [failure, setFailure] = useState("");
  const [conflictAgainst, setConflictAgainst] = useState<CaptureDetail | null>(
    null,
  );
  const form = useForm<CaptureFields>({
    resolver: zodResolver(CaptureFieldsSchema),
    defaultValues: { title: capture.title, rawBody: capture.rawBody },
  });
  const { errors, isSubmitting } = form.formState;
  const title = form.watch("title");
  const body = form.watch("rawBody");
  const changed = title !== capture.title || body !== capture.rawBody;
  const guard = useDirtyGuard(changed);
  const baseline = conflictAgainst ?? capture;
  const unchangedFromBase =
    title === baseline.title && body === baseline.rawBody;
  return (
    <>
      <UnsavedGuard isDirty={guard.isDirty} />
      <form
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setFailure("");
          try {
            await reviseCapture(
              workspaceId,
              capture.id,
              { baseVersion: baseline.version, ...values },
              key.keyFor(JSON.stringify([baseline.version, values])),
            );
            guard.markSaved();
            key.reset();
            await invalidateCaptures(queryClient, userId);
            onSaved();
          } catch (error) {
            const kind = classifyCaptureError(error);
            if (kind === "conflict") {
              const latest = await onRefetch().catch(() => undefined);
              if (latest) setConflictAgainst(latest);
            }
            setFailure(captureFailureMessage[kind]);
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          {conflictAgainst && (
            <Card
              title={`서버의 최신 내용 (revision ${conflictAgainst.currentRevision})`}
            >
              <p className="ieum-help">
                작성 중인 내용은 그대로 두었습니다. 아래 최신 내용과 비교한 뒤
                그 위에 저장하거나 취소할 수 있습니다.
              </p>
              <p data-testid="latest-title">{conflictAgainst.title}</p>
              <p className="ieum-break" data-testid="latest-body">
                {conflictAgainst.rawBody}
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
            label="내용"
            rows={14}
            help={`저장하면 새 revision이 만들어지고 이전 원문은 그대로 남습니다. ${byteLength(body).toLocaleString("ko-KR")} / 200,000 바이트`}
            error={errors.rawBody?.message}
            {...form.register("rawBody")}
          />
          <Cluster>
            <Button
              type="submit"
              intent="primary"
              busy={isSubmitting}
              disabled={unchangedFromBase}
              disabledReason={
                unchangedFromBase ? "바뀐 내용이 없습니다." : undefined
              }
            >
              {conflictAgainst ? "최신 버전 위에 저장" : "새 revision으로 저장"}
            </Button>
            <Button onClick={onCancel}>취소</Button>
          </Cluster>
        </Stack>
      </form>
    </>
  );
}
