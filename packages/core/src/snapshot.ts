export type Utf16Span = Readonly<{
  start: number;
  end: number;
  encoding: "utf16";
}>;

export type CoreCaptureSnapshot = Readonly<{
  captureId: string;
  revision: number;
  rawBody: string;
  span: Utf16Span;
}>;

export function sliceRawSpan(snapshot: CoreCaptureSnapshot): string {
  const { start, end } = snapshot.span;
  if (
    snapshot.span.encoding !== "utf16" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > snapshot.rawBody.length
  ) {
    throw new RangeError("Invalid UTF-16 source span");
  }
  return snapshot.rawBody.slice(start, end);
}
