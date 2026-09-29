import * as z from "zod";

const encoder = new TextEncoder();

/** Mirrors the server: non-blank, no NUL, at most 200,000 UTF-8 bytes. */
export const CaptureFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(300, "제목은 300자까지 입력할 수 있습니다.")
    .refine((value) => !value.includes("\u0000"), "사용할 수 없는 문자입니다."),
  rawBody: z
    .string()
    .refine((value) => value.trim().length > 0, "내용을 입력해 주세요.")
    .refine(
      (value) => encoder.encode(value).length <= 200_000,
      "내용이 너무 깁니다. 200KB 이하로 줄이거나 나누어 기록해 주세요.",
    )
    .refine((value) => !value.includes("\u0000"), "사용할 수 없는 문자입니다."),
});
export type CaptureFields = z.infer<typeof CaptureFieldsSchema>;

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}
