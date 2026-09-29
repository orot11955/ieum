import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Field, Notice, Stack } from "@ieum/ui";
import { describeAuthError, signIn, type SignInResult } from "./api";

const LoginSchema = z.object({
  email: z.email("이메일 형식을 확인해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});
type LoginValues = z.infer<typeof LoginSchema>;

export function LoginForm({
  onSignedIn,
}: {
  onSignedIn: (result: SignInResult) => void;
}) {
  const [failure, setFailure] = useState("");
  const form = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        setFailure("");
        try {
          onSignedIn(await signIn(values.email, values.password));
        } catch (error) {
          setFailure(describeAuthError(error));
          form.setValue("password", "");
          form.setFocus("password");
        }
      })}
    >
      <Stack>
        {failure && <Notice tone="danger">{failure}</Notice>}
        <Field
          label="이메일"
          type="email"
          autoComplete="username"
          inputMode="email"
          error={errors.email?.message}
          {...form.register("email")}
        />
        <Field
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register("password")}
        />
        <Button type="submit" intent="primary" busy={isSubmitting}>
          로그인
        </Button>
      </Stack>
    </form>
  );
}
