import type { CaptureRevision, RawExtractCandidate } from "@ieum/core";

/** The port receives only a capture already authorized for this actor. */
export interface ExtractionParser {
  parse(capture: CaptureRevision): Promise<unknown>;
}

/** A deliberately small offline parser; unrecognized prose stays as an ordinary capture. */
export class LocalExtractionParser implements ExtractionParser {
  async parse(capture: CaptureRevision): Promise<RawExtractCandidate[]> {
    const result: RawExtractCandidate[] = [];
    const lines = capture.rawBody.match(/[^\r\n]+/g) ?? [];
    let searchFrom = 0;
    for (const line of lines) {
      const start = capture.rawBody.indexOf(line, searchFrom);
      searchFrom = start + line.length;
      const trimmed = line.trim();
      const task = /^(?:-\s*\[\s*\]|TODO:|할 일:)\s*(.+)$/i.exec(trimmed);
      const event = /^(?:EVENT:|일정:)\s*(.+)$/i.exec(trimmed);
      const thought = /^(?:NOTE:|생각:)\s*(.+)$/i.exec(trimmed);
      if (!task && !event && !thought) continue;
      const title = (task?.[1] ?? event?.[1] ?? thought?.[1] ?? "").trim();
      if (!title || title.length > 300) continue;
      const kind = task ? "task" : event ? "event" : "thought_unit";
      const expression = event
        ? /\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/.exec(line)?.[0]
        : undefined;
      if (event && !expression) continue;
      result.push({
        captureId: capture.captureId,
        captureRevision: capture.revision,
        sourceSpan: { start, end: start + line.length, encoding: "utf16" },
        sourceText: line,
        targetKind: kind,
        suggestedTitle: title,
        suggestedBody: null,
        temporal: expression
          ? {
              expression,
              basisEpochMs: capture.occurredAt ?? capture.recordedAt,
              timeZone: null,
              proposedEpochMs: null,
              ambiguity: [],
            }
          : null,
      });
    }
    return result;
  }
}
