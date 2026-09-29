import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Status, Table } from "@ieum/ui";
import { sessionKeys, useSessions } from "../../entities/session/api";
import { request } from "../../shared/api/http";

function formatTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export function SessionList({ userId }: { userId: string }) {
  const sessions = useSessions(userId);
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  if (sessions.isPending) return <p role="status">세션 목록을 불러오는 중…</p>;
  if (sessions.isError)
    return (
      <Notice tone="danger">
        세션 목록을 불러오지 못했습니다.{" "}
        <Button intent="ghost" onClick={() => void sessions.refetch()}>
          다시 시도
        </Button>
      </Notice>
    );
  return (
    <>
      {failure && <Notice tone="danger">{failure}</Notice>}
      <Table
        caption="로그인된 기기"
        columns={[
          { key: "device", label: "기기" },
          { key: "created", label: "로그인" },
          { key: "action", label: "관리" },
        ]}
        rows={sessions.data.sessions.map((session) => ({
          id: session.id,
          cells: {
            device: (
              <span className="ieum-break">
                {session.userAgent ?? "알 수 없는 기기"}
                {session.current && (
                  <>
                    {" "}
                    <Status tone="info">현재 기기</Status>
                  </>
                )}
              </span>
            ),
            created: formatTime(session.createdAt),
            action: session.current ? (
              "—"
            ) : (
              <Button
                intent="danger"
                busy={revoking === session.id}
                onClick={async () => {
                  setRevoking(session.id);
                  setFailure("");
                  try {
                    await request(
                      `/api/v1/me/sessions/${encodeURIComponent(session.id)}`,
                      { method: "DELETE" },
                    );
                    await queryClient.invalidateQueries({
                      queryKey: sessionKeys.sessions(userId),
                    });
                  } catch {
                    setFailure("세션을 끝내지 못했습니다. 다시 시도해 주세요.");
                  } finally {
                    setRevoking(null);
                  }
                }}
              >
                세션 끝내기
              </Button>
            ),
          },
        }))}
      />
    </>
  );
}
