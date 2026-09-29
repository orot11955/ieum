import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Field, Notice, Stack } from "@ieum/ui";
import { ApiError, request } from "../../shared/api/http";

const AcceptSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해 주세요.").max(200),
    password: z
      .string()
      .min(15, "비밀번호는 15자 이상이어야 합니다.")
      .max(1024),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    message: "비밀번호가 서로 다릅니다.",
  });
type AcceptValues = z.infer<typeof AcceptSchema>;

export function AcceptInvitationForm({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: () => void;
}) {
  const [failure, setFailure] = useState("");
  const form = useForm<AcceptValues>({
    resolver: zodResolver(AcceptSchema),
    defaultValues: { name: "", password: "", confirmation: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ name, password }) => {
        setFailure("");
        try {
          await request("/api/v1/invitations/accept", {
            method: "POST",
            body: { token, name, password },
            sessionBound: false,
          });
          onAccepted();
        } catch (error) {
          setFailure(
            error instanceof ApiError && error.status === 404
              ? "초대가 만료되었거나 이미 사용되었습니다. 초대한 사람에게 새 초대를 요청해 주세요."
              : error instanceof ApiError && error.status === 422
                ? "입력 형식을 다시 확인해 주세요."
                : "지금은 처리할 수 없습니다. 다시 시도해 주세요.",
          );
        }
      })}
    >
      <Stack>
        {failure && <Notice tone="danger">{failure}</Notice>}
        <Field
          label="이름"
          autoComplete="name"
          error={errors.name?.message}
          {...form.register("name")}
        />
        <Field
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          help="15자 이상. 다른 곳에서 쓰지 않는 문장을 권장합니다."
          error={errors.password?.message}
          {...form.register("password")}
        />
        <Field
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          error={errors.confirmation?.message}
          {...form.register("confirmation")}
        />
        <Button type="submit" intent="primary" busy={isSubmitting}>
          계정 만들기
        </Button>
      </Stack>
    </form>
  );
}
