import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Notice, Stack, Status } from "@ieum/ui";
import { sessionKeys, useTwoFactorEnabled } from "../../entities/session/api";
import { ApiError, request } from "../../shared/api/http";

type Enrollment = { secret: string; uri: string; backupCodes: string[] };

const PasswordSchema = z.object({
  password: z.string().min(1, "현재 비밀번호를 입력해 주세요."),
});
const CodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "6자리 숫자를 입력해 주세요."),
});

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400)
    return "비밀번호가 맞지 않습니다.";
  if (error instanceof ApiError && error.status === 401)
    return "코드가 맞지 않습니다.";
  return "지금은 처리할 수 없습니다. 다시 시도해 주세요.";
}

function PasswordStep({
  label,
  intent,
  onSubmit,
}: {
  label: string;
  intent: "primary" | "danger";
  onSubmit: (password: string) => Promise<void>;
}) {
  const [failure, setFailure] = useState("");
  const form = useForm<{ password: string }>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { password: "" },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ password }) => {
        setFailure("");
        try {
          await onSubmit(password);
        } catch (error) {
          setFailure(failureMessage(error));
          form.setValue("password", "");
        }
      })}
    >
      <Stack>
        {failure && <Notice tone="danger">{failure}</Notice>}
        <Field
          label="현재 비밀번호"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          {...form.register("password")}
        />
        <Button
          type="submit"
          intent={intent}
          busy={form.formState.isSubmitting}
        >
          {label}
        </Button>
      </Stack>
    </form>
  );
}

function VerifyStep({
  enrollment,
  onVerified,
}: {
  enrollment: Enrollment;
  onVerified: () => Promise<void>;
}) {
  const [failure, setFailure] = useState("");
  const form = useForm<{ code: string }>({
    resolver: zodResolver(CodeSchema),
    defaultValues: { code: "" },
  });
  return (
    <Stack>
      <p>
        인증 앱에 아래 키를 등록한 뒤, 앱에 표시된 코드를 입력하면 설정이
        끝납니다.
      </p>
      <p className="ieum-inline-code" data-testid="totp-secret">
        {enrollment.secret}
      </p>
      <details>
        <summary>인증 앱 등록 주소 보기</summary>
        <p className="ieum-inline-code" data-testid="totp-uri">
          {enrollment.uri}
        </p>
      </details>
      <Notice tone="warning">
        <p>
          백업 코드를 지금 안전한 곳에 적어 두세요. 이 화면을 떠나면 다시 볼 수
          없습니다.
        </p>
        <ul className="ieum-inline-code" data-testid="backup-codes">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </Notice>
      <form
        noValidate
        onSubmit={form.handleSubmit(async ({ code }) => {
          setFailure("");
          try {
            await request("/api/auth/two-factor/verify-totp", {
              method: "POST",
              body: { code },
              // A wrong code or password is not a session expiry.
              sessionBound: false,
            });
            await onVerified();
          } catch (error) {
            setFailure(failureMessage(error));
            form.setValue("code", "");
          }
        })}
      >
        <Stack>
          {failure && <Notice tone="danger">{failure}</Notice>}
          <Field
            label="인증 앱 코드"
            inputMode="numeric"
            autoComplete="one-time-code"
            error={form.formState.errors.code?.message}
            {...form.register("code")}
          />
          <Button
            type="submit"
            intent="primary"
            busy={form.formState.isSubmitting}
          >
            확인하고 켜기
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}

export function TwoFactorSettings({ userId }: { userId: string }) {
  const enabled = useTwoFactorEnabled(userId);
  const queryClient = useQueryClient();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: sessionKeys.authSession(userId),
    });
  if (enabled.isPending) return <p role="status">상태를 확인하는 중…</p>;
  if (enabled.isError)
    return (
      <Notice tone="danger">2단계 인증 상태를 불러오지 못했습니다.</Notice>
    );
  if (enabled.data)
    return (
      <Stack>
        <p>
          <Status tone="success">켜짐</Status> 로그인할 때 인증 앱 코드를 함께
          확인합니다.
        </p>
        <PasswordStep
          label="2단계 인증 끄기"
          intent="danger"
          onSubmit={async (password) => {
            await request("/api/auth/two-factor/disable", {
              method: "POST",
              body: { password },
              // A wrong code or password is not a session expiry.
              sessionBound: false,
            });
            await refresh();
          }}
        />
      </Stack>
    );
  if (enrollment)
    return (
      <VerifyStep
        enrollment={enrollment}
        onVerified={async () => {
          setEnrollment(null);
          await refresh();
        }}
      />
    );
  return (
    <Stack>
      <p>
        <Status>꺼짐</Status> 비밀번호에 더해 인증 앱 코드로 로그인을
        보호합니다.
      </p>
      <PasswordStep
        label="2단계 인증 설정 시작"
        intent="primary"
        onSubmit={async (password) => {
          const result = await request<{
            totpURI: string;
            backupCodes: string[];
          }>("/api/auth/two-factor/enable", {
            method: "POST",
            body: { password },
            // A wrong code or password is not a session expiry.
            sessionBound: false,
          });
          setEnrollment({
            uri: result.totpURI,
            secret: new URL(result.totpURI).searchParams.get("secret") ?? "",
            backupCodes: result.backupCodes,
          });
        }}
      />
    </Stack>
  );
}
