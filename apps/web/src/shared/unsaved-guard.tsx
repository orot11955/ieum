import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { Button, Cluster, Dialog } from "@ieum/ui";

/**
 * Blocks in-app navigation and tab close while there is unsaved text. The draft
 * lives only in the page; leaving discards it, so the user must choose.
 */
export function UnsavedGuard({ isDirty }: { isDirty: () => boolean }) {
  // Read at navigation time: state set just before navigating may not have
  // rendered yet, and a finished save must never block its own redirect.
  const blocker = useBlocker(() => isDirty());
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
  return (
    <Dialog
      open={blocker.state === "blocked"}
      title="저장하지 않은 내용이 있습니다"
      onClose={() => blocker.reset?.()}
    >
      <p>이 화면을 떠나면 작성 중인 내용이 사라집니다.</p>
      <Cluster>
        <Button intent="primary" onClick={() => blocker.reset?.()}>
          계속 작성
        </Button>
        <Button intent="danger" onClick={() => blocker.proceed?.()}>
          저장하지 않고 나가기
        </Button>
      </Cluster>
    </Dialog>
  );
}

/**
 * Tracks whether the page holds unsaved text. `markSaved` flips synchronously,
 * so a redirect that follows a successful save is never blocked by a stale render.
 */
export function useDirtyGuard(dirty: boolean) {
  const saved = useRef(false);
  const current = useRef(false);
  current.current = dirty && !saved.current;
  const isDirty = useCallback(() => current.current, []);
  const markSaved = useCallback(() => {
    saved.current = true;
    current.current = false;
  }, []);
  return { isDirty, markSaved };
}
