import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Cluster, Field, Notice, Stack, TextArea } from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import {
  captureFailureMessage,
  classifyCaptureError,
  createCapture,
  invalidateCaptures,
} from "../../entities/captures/api";
import {
  byteLength,
  CaptureFieldsSchema,
  type CaptureFields,
} from "./capture-fields";
import { UnsavedGuard, useDirtyGuard } from "../../shared/unsaved-guard";

export function NewCaptureForm({
  userId,
  workspaceId,
  onCreated,
  onCancel,
}: {
  userId: string;
  workspaceId: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const [failure, setFailure] = useState("");
  const form = useForm<CaptureFields>({
    resolver: zodResolver(CaptureFieldsSchema),
    defaultValues: { title: "", rawBody: "" },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const body = form.watch("rawBody");
  const guard = useDirtyGuard(isDirty);
  return (
    <>
      <UnsavedGuard isDirty={guard.isDirty} />
      <form
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setFailure("");
          try {
            const created = await createCapture(
              workspaceId,
              values,
              key.keyFor(JSON.stringify(values)),
            );
            guard.markSaved();
            key.reset();
            await invalidateCaptures(queryClient, userId);
            onCreated(created.id);
          } catch (error) {
            setFailure(captureFailureMessage[classifyCaptureError(error)]);
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          <Field
            label="제목"
            autoComplete="off"
            error={errors.title?.message}
            {...form.register("title")}
          />
          <TextArea
            label="내용"
            rows={12}
            help={`원문 그대로 보존됩니다. ${byteLength(body).toLocaleString("ko-KR")} / 200,000 바이트`}
            error={errors.rawBody?.message}
            {...form.register("rawBody")}
          />
          <Cluster>
            <Button type="submit" intent="primary" busy={isSubmitting}>
              기록 저장
            </Button>
            <Button onClick={onCancel}>취소</Button>
          </Cluster>
        </Stack>
      </form>
    </>
  );
}
