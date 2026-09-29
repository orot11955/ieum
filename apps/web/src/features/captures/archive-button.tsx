import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Cluster, Dialog, Notice } from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import {
  archiveCapture,
  captureFailureMessage,
  classifyCaptureError,
  invalidateCaptures,
  type CaptureDetail,
} from "../../entities/captures/api";

export function ArchiveCaptureButton({
  userId,
  workspaceId,
  capture,
  onArchived,
}: {
  userId: string;
  workspaceId: string;
  capture: CaptureDetail;
  onArchived: () => void;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  return (
    <>
      <Button intent="danger" onClick={() => setOpen(true)}>
        보관
      </Button>
      <Dialog
        open={open}
        title="이 기록을 보관할까요?"
        onClose={() => setOpen(false)}
      >
        <p>
          보관한 기록은 기본 목록에서 빠지고 수정할 수 없습니다. 원문과 지난
          revision은 삭제되지 않습니다.
        </p>
        {failure && <Notice tone="danger">{failure}</Notice>}
        <Cluster>
          <Button
            intent="danger"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setFailure("");
              try {
                await archiveCapture(
                  workspaceId,
                  capture.id,
                  { baseVersion: capture.version },
                  key.keyFor(String(capture.version)),
                );
                key.reset();
                await invalidateCaptures(queryClient, userId);
                setOpen(false);
                onArchived();
              } catch (error) {
                const kind = classifyCaptureError(error);
                setFailure(
                  kind === "conflict"
                    ? "다른 곳에서 먼저 바뀌었습니다. 기록을 다시 열어 확인해 주세요."
                    : captureFailureMessage[kind],
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            보관하기
          </Button>
          <Button onClick={() => setOpen(false)}>취소</Button>
        </Cluster>
      </Dialog>
    </>
  );
}
