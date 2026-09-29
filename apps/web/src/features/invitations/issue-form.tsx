import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { InvitationIssueResponseSchema } from "@ieum/contracts/identity";
import { Button, Field, Notice, Stack } from "@ieum/ui";
import { ApiError, request } from "../../shared/api/http";

const IssueSchema = z.object({
  email: z.email("이메일 형식을 확인해 주세요."),
});

export function IssueInvitationForm() {
  const [issued, setIssued] = useState<{
    link: string;
    expiresAt: string;
  } | null>(null);
  const [failure, setFailure] = useState("");
  const form = useForm<{ email: string }>({
    resolver: zodResolver(IssueSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Stack>
      <form
        noValidate
        onSubmit={form.handleSubmit(async ({ email }) => {
          setFailure("");
          setIssued(null);
          try {
            const invitation = InvitationIssueResponseSchema.parse(
              await request("/api/v1/ops/invitations", {
                method: "POST",
                body: { email },
              }),
            );
            setIssued({
              link: `${window.location.origin}/invitation#${invitation.token}`,
              expiresAt: new Date(invitation.expiresAt).toLocaleString("ko-KR"),
            });
            form.reset();
          } catch (error) {
            setFailure(
              error instanceof ApiError && error.status === 403
                ? "초대를 만들 권한이 없습니다."
                : error instanceof ApiError && error.status === 409
                  ? "이미 가입했거나 처리 중인 이메일입니다."
                  : "초대를 만들지 못했습니다. 다시 시도해 주세요.",
            );
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          <Field
            label="초대할 이메일"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...form.register("email")}
          />
          <Button type="submit" intent="primary" busy={isSubmitting}>
            초대 링크 만들기
          </Button>
        </Stack>
      </form>
      {issued && (
        <Notice tone="success">
          <p>
            초대 링크를 만들었습니다. 이 화면을 떠나면 다시 볼 수 없으니 안전한
            경로로 전달해 주세요. 만료: {issued.expiresAt}
          </p>
          <p className="ieum-inline-code" data-testid="invitation-link">
            {issued.link}
          </p>
        </Notice>
      )}
    </Stack>
  );
}
