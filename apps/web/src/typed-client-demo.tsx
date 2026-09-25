import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import createClient from "openapi-fetch";
import * as z from "zod";
import type { paths as ManagementPaths } from "@ieum/contracts/management-client";
import {
  CreateCaptureResponseSchema,
  createCapturePath,
} from "@ieum/contracts/management";
import { Button, Field, Notice, Stack, Status } from "@ieum/ui";

const DraftSchema = z.strictObject({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(300),
});
type DraftInput = z.input<typeof DraftSchema>;
type DraftValue = z.output<typeof DraftSchema>;

export async function submitSyntheticCapture(
  title: string,
  fetcher: typeof fetch = fetch,
) {
  const client = createClient<ManagementPaths>({
    baseUrl: window.location.origin,
    fetch: fetcher,
    credentials: "include",
  });
  const { data, response } = await client.POST(createCapturePath, {
    params: {
      path: { wid: "fixture-workspace" },
      header: { "Idempotency-Key": crypto.randomUUID() },
    },
    body: { title, rawBody: "FE-02 합성 입력 표본" },
  });
  if (!response.ok)
    throw new Error(
      `서버가 저장을 거부했습니다 (HTTP ${response.status}). 입력은 유지됩니다.`,
    );
  const parsed = CreateCaptureResponseSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("서버 응답 형식을 확인하지 못했습니다. 입력은 유지됩니다.");
  return parsed.data;
}

export function TypedClientDemo() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DraftInput, unknown, DraftValue>({
    resolver: zodResolver(DraftSchema),
    defaultValues: { title: "" },
  });
  const mutation = useMutation({
    mutationFn: (value: DraftValue) => submitSyntheticCapture(value.title),
  });
  const submit = handleSubmit(async (value) => {
    try {
      await mutation.mutateAsync(value);
    } catch (error) {
      setError("root.server", {
        message:
          error instanceof Error ? error.message : "서버 응답을 확인해 주세요.",
      });
    }
  });
  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <Notice>
          합성 API 입력 표본입니다. 실제 인증과 저장은 연결되지 않았으며 실패 시
          작성한 제목을 보존합니다.
        </Notice>
        <Field
          label="문서 제목 표본"
          {...register("title")}
          {...(errors.title?.message ? { error: errors.title.message } : {})}
        />
        {errors.root?.server?.message && (
          <Notice tone="danger">{errors.root.server.message}</Notice>
        )}
        <Button intent="primary" type="submit" busy={mutation.isPending}>
          합성 저장 요청
        </Button>
        {mutation.data && (
          <Status tone="success">
            응답 검증 완료 · revision {mutation.data.revision}
          </Status>
        )}
      </Stack>
    </form>
  );
}
