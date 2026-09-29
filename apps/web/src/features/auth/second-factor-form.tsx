import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Cluster, Field, Notice, Stack } from "@ieum/ui";
import { ApiError } from "../../shared/api/http";
import { verifySecondFactor } from "./api";

const CodeSchema = z.object({
  code: z.string().trim().min(6, "코드를 입력해 주세요.").max(64),
});

export function SecondFactorForm({
  onVerified,
  onChallengeExpired,
}: {
  onVerified: () => void;
  onChallengeExpired: () => void;
}) {
  const [kind, setKind] = useState<"totp" | "backup">("totp");
  const [failure, setFailure] = useState("");
  const form = useForm<{ code: string }>({
    resolver: zodResolver(CodeSchema),
    defaultValues: { code: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ code }) => {
        setFailure("");
        try {
          await verifySecondFactor(kind, code);
          onVerified();
        } catch (error) {
          form.setValue("code", "");
          if (
            error instanceof ApiError &&
            error.status === 401 &&
            error.code !== "INVALID_CODE" &&
            error.code !== "INVALID_BACKUP_CODE"
          ) {
            onChallengeExpired();
            return;
          }
          setFailure(
            error instanceof ApiError && error.status < 500
              ? "코드가 맞지 않습니다. 다시 확인해 주세요."
              : "지금은 확인할 수 없습니다. 다시 시도해 주세요.",
          );
          form.setFocus("code");
        }
      })}
    >
      <Stack>
        {failure && <Notice tone="danger">{failure}</Notice>}
        <Field
          label={kind === "totp" ? "인증 앱 코드" : "백업 코드"}
          autoComplete="one-time-code"
          inputMode={kind === "totp" ? "numeric" : "text"}
          help={
            kind === "totp"
              ? "인증 앱에 표시된 6자리 숫자를 입력합니다."
              : "백업 코드는 한 번만 사용할 수 있습니다."
          }
          error={errors.code?.message}
          {...form.register("code")}
        />
        <Cluster>
          <Button type="submit" intent="primary" busy={isSubmitting}>
            확인
          </Button>
          <Button
            intent="ghost"
            onClick={() => {
              setFailure("");
              form.reset({ code: "" });
              setKind(kind === "totp" ? "backup" : "totp");
            }}
          >
            {kind === "totp" ? "백업 코드 사용" : "인증 앱 코드 사용"}
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}
