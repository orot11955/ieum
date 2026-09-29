import type { CaptureSpan } from "../../entities/captures/api";

export const MAX_SPANS = 100;

/** The browser text area reports positions on LF-normalised text; map back to the stored text. */
export function displayToRawOffset(raw: string, displayOffset: number): number {
  let shown = 0;
  let index = 0;
  while (index < raw.length && shown < displayOffset) {
    index += raw[index] === "\r" && raw[index + 1] === "\n" ? 2 : 1;
    shown++;
  }
  return index;
}

export function displayText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

export function spansFromCuts(
  raw: string,
  cuts: readonly number[],
): CaptureSpan[] {
  const points = [0, ...cuts, raw.length];
  return points.slice(0, -1).map((start, index) => ({
    start,
    end: points[index + 1]!,
    encoding: "utf16" as const,
  }));
}

export type CutCheck =
  { ok: true; cuts: number[] } | { ok: false; message: string };

/** Adds a cut position if the result still satisfies the server's span rules. */
export function addCut(
  raw: string,
  cuts: readonly number[],
  offset: number,
): CutCheck {
  if (offset <= 0 || offset >= raw.length)
    return { ok: false, message: "처음이나 끝이 아닌 위치를 골라 주세요." };
  if (cuts.includes(offset))
    return { ok: false, message: "이미 나눈 위치입니다." };
  const before = raw.charCodeAt(offset - 1);
  const after = raw.charCodeAt(offset);
  if (
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  )
    return {
      ok: false,
      message: "이모지처럼 하나의 글자인 부분 중간에서는 나눌 수 없습니다.",
    };
  const next = [...cuts, offset].sort((a, b) => a - b);
  if (next.length + 1 > MAX_SPANS)
    return {
      ok: false,
      message: `최대 ${MAX_SPANS}개 조각까지 나눌 수 있습니다.`,
    };
  const blank = spansFromCuts(raw, next).find(
    (span) => raw.slice(span.start, span.end).trim().length === 0,
  );
  if (blank)
    return {
      ok: false,
      message: "공백뿐인 조각이 생기는 위치에서는 나눌 수 없습니다.",
    };
  return { ok: true, cuts: next };
}
