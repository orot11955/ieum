import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Cluster, Notice, Stack, Table } from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import {
  captureFailureMessage,
  classifyCaptureError,
  invalidateCaptures,
  splitCapture,
  type CaptureDetail,
} from "../../entities/captures/api";
import {
  addCut,
  displayText,
  displayToRawOffset,
  spansFromCuts,
} from "./split-spans";
import { UnsavedGuard, useDirtyGuard } from "../../shared/unsaved-guard";

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
}

export function SplitCaptureForm({
  userId,
  workspaceId,
  capture,
  onSplit,
  onCancel,
}: {
  userId: string;
  workspaceId: string;
  capture: CaptureDetail;
  onSplit: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const area = useRef<HTMLTextAreaElement>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const raw = capture.rawBody;
  const spans = spansFromCuts(raw, cuts);
  const guard = useDirtyGuard(cuts.length > 0);
  return (
    <Stack>
      <UnsavedGuard isDirty={guard.isDirty} />
      <p className="ieum-help">
        나누고 싶은 위치에 커서를 두고 버튼을 누르세요. 원문은 바뀌지 않고, 나눈
        조각이 별도의 단위(unit)로 기록됩니다.
      </p>
      {message && <Notice tone="danger">{message}</Notice>}
      <label className="ieum-label">
        원문 (읽기 전용)
        <textarea
          ref={area}
          className="ieum-field ieum-editor"
          readOnly
          rows={12}
          value={displayText(raw)}
          aria-label="원문 (읽기 전용)"
        />
      </label>
      <Cluster>
        <Button
          onClick={() => {
            const shown = area.current?.selectionStart ?? 0;
            const result = addCut(raw, cuts, displayToRawOffset(raw, shown));
            if (result.ok) {
              setCuts(result.cuts);
              setMessage("");
            } else setMessage(result.message);
          }}
        >
          커서 위치에서 나누기
        </Button>
        <Button
          intent="ghost"
          disabled={cuts.length === 0}
          onClick={() => setCuts([])}
        >
          나눔 모두 지우기
        </Button>
      </Cluster>
      <Table
        caption={`나눌 조각 ${spans.length}개`}
        columns={[
          { key: "index", label: "순서" },
          { key: "range", label: "범위(UTF-16)" },
          { key: "text", label: "내용" },
          { key: "action", label: "관리" },
        ]}
        rows={spans.map((span, index) => ({
          id: String(span.start),
          cells: {
            index: index + 1,
            range: `${span.start}–${span.end}`,
            text: (
              <span className="ieum-break">
                {excerpt(raw.slice(span.start, span.end))}
              </span>
            ),
            action:
              index < cuts.length ? (
                <Button
                  intent="ghost"
                  onClick={() =>
                    setCuts(cuts.filter((cut) => cut !== span.end))
                  }
                >
                  이 나눔 지우기
                </Button>
              ) : (
                "—"
              ),
          },
        }))}
      />
      <Cluster>
        <Button
          intent="primary"
          busy={busy}
          disabled={cuts.length === 0}
          disabledReason={
            cuts.length === 0 ? "나눌 위치를 하나 이상 골라 주세요." : undefined
          }
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await splitCapture(
                workspaceId,
                capture.id,
                {
                  baseVersion: capture.version,
                  captureRevision: capture.currentRevision,
                  spans,
                },
                key.keyFor(JSON.stringify([capture.version, spans])),
              );
              guard.markSaved();
              key.reset();
              await invalidateCaptures(queryClient, userId);
              onSplit();
            } catch (error) {
              const kind = classifyCaptureError(error);
              setMessage(
                kind === "conflict"
                  ? "다른 곳에서 먼저 바뀌었습니다. 기록을 다시 열어 최신 내용에서 나눠 주세요."
                  : captureFailureMessage[kind],
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {spans.length}개로 나누어 저장
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </Cluster>
    </Stack>
  );
}
