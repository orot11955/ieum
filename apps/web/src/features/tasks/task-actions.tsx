import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Cluster, Field, Notice, Stack, TextArea } from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import { UnsavedGuard, useDirtyGuard } from "../../shared/unsaved-guard";
import {
  addTaskResult,
  classifyTaskError,
  invalidateTasks,
  nextStates,
  taskFailureMessage,
  transitionLabel,
  transitionTask,
  type TaskDetail,
  type TaskState,
  type TaskSummary,
} from "../../entities/tasks/api";
import { CaptureFieldsSchema } from "../captures/capture-fields";

/** Runs one state change; on a stale version or refused move the latest task is reloaded. */
export function useTransition(userId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const run = async (
    task: Pick<TaskSummary, "id" | "version">,
    target: TaskState,
  ) => {
    setBusy(`${task.id}:${target}`);
    setFailure("");
    try {
      await transitionTask(
        workspaceId,
        task.id,
        { baseVersion: task.version, targetState: target },
        key.keyFor(`${task.id}:${task.version}:${target}`),
      );
      key.reset();
    } catch (error) {
      const kind = classifyTaskError(error);
      setFailure(taskFailureMessage[kind]);
    } finally {
      // Success or not, show what the server now says.
      await invalidateTasks(queryClient, userId);
      setBusy(null);
    }
  };
  return { run, busy, failure };
}

export function TransitionButtons({
  userId,
  workspaceId,
  task,
}: {
  userId: string;
  workspaceId: string;
  task: TaskDetail;
}) {
  const { run, busy, failure } = useTransition(userId, workspaceId);
  return (
    <Stack>
      {failure && <Notice tone="warning">{failure}</Notice>}
      <Cluster>
        {nextStates[task.state].map((target) => (
          <Button
            key={target}
            intent={target === "DONE" ? "primary" : "secondary"}
            busy={busy === `${task.id}:${target}`}
            onClick={() => void run(task, target)}
          >
            {transitionLabel[target]}
          </Button>
        ))}
      </Cluster>
    </Stack>
  );
}

/** Records what came of a finished task as a new capture linked to that completion. */
export function ResultForm({
  userId,
  workspaceId,
  task,
}: {
  userId: string;
  workspaceId: string;
  task: TaskDetail;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const [failure, setFailure] = useState("");
  const form = useForm<{ title: string; rawBody: string }>({
    resolver: zodResolver(CaptureFieldsSchema),
    defaultValues: { title: `${task.title} 결과`, rawBody: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const guard = useDirtyGuard(form.watch("rawBody").length > 0);
  return (
    <>
      <UnsavedGuard isDirty={guard.isDirty} />
      <form
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setFailure("");
          try {
            await addTaskResult(
              workspaceId,
              task.id,
              { baseVersion: task.version, ...values },
              key.keyFor(JSON.stringify([task.version, values])),
            );
            guard.markSaved();
            key.reset();
            await invalidateTasks(queryClient, userId);
          } catch (error) {
            const kind = classifyTaskError(error);
            setFailure(taskFailureMessage[kind]);
            if (kind !== "retry") await invalidateTasks(queryClient, userId);
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          <p className="ieum-help">
            결과는 새 기록으로 저장되고 이 할일의 완료와 연결됩니다. 원문은
            그대로 보존됩니다.
          </p>
          <Field
            label="결과 제목"
            autoComplete="off"
            error={errors.title?.message}
            {...form.register("title")}
          />
          <TextArea
            label="결과 내용"
            rows={6}
            error={errors.rawBody?.message}
            {...form.register("rawBody")}
          />
          <Button type="submit" intent="primary" busy={isSubmitting}>
            결과 기록
          </Button>
        </Stack>
      </form>
    </>
  );
}
