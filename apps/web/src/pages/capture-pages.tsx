import type { ReactNode } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Check,
  Cluster,
  Empty,
  Notice,
  Page,
  Stack,
  Status,
  Table,
} from "@ieum/ui";
import type { ShellContext } from "../app/shell";
import {
  captureKeys,
  useCapture,
  useCaptureList,
  type CaptureDetail,
} from "../entities/captures/api";
import { ApiError } from "../shared/api/http";
import { formatDateTime } from "../shared/format";
import { NewCaptureForm } from "../features/captures/capture-form";
import { ReviseCaptureForm } from "../features/captures/revise-form";
import { SplitCaptureForm } from "../features/captures/split-form";
import { ArchiveCaptureButton } from "../features/captures/archive-button";
import { UnitContextsCell } from "../features/contexts/unit-contexts-cell";
import { ForbiddenPage, NotFoundPage } from "./app-pages";

export function CaptureListPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get("archived") === "1";
  const list = useCaptureList(me.user.id, me.workspace.id, includeArchived);
  const captures = list.data?.pages.flatMap((page) => page.captures) ?? [];
  return (
    <Page
      eyebrow="기록함"
      title="기록"
      actions={
        <Button intent="primary" onClick={() => navigate("/captures/new")}>
          새 기록
        </Button>
      }
    >
      <Check
        label="보관한 기록도 보기"
        checked={includeArchived}
        onChange={(event) =>
          setParams(event.target.checked ? { archived: "1" } : {}, {
            replace: true,
          })
        }
      />
      {list.isPending ? (
        <p role="status">기록을 불러오는 중…</p>
      ) : list.isError ? (
        <Notice tone="danger">
          기록을 불러오지 못했습니다.{" "}
          <Button intent="ghost" onClick={() => void list.refetch()}>
            다시 시도
          </Button>
        </Notice>
      ) : captures.length === 0 ? (
        <Empty>
          {includeArchived
            ? "기록이 없습니다."
            : "아직 기록이 없습니다. 생각이나 경험을 원문 그대로 남겨 보세요."}
        </Empty>
      ) : (
        <ul className="ieum-list" aria-label="기록 목록">
          {captures.map((capture) => (
            <li key={capture.id} className="ieum-list-item">
              <div>
                <Link to={`/captures/${capture.id}`} className="ieum-break">
                  {capture.title}
                </Link>
                <p className="ieum-help">
                  {formatDateTime(capture.updatedAt, me.preferences.timeZone)} ·
                  revision {capture.currentRevision}
                </p>
              </div>
              {capture.state === "ARCHIVED" && <Status>보관됨</Status>}
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <Button
          busy={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          더 보기
        </Button>
      )}
    </Page>
  );
}

export function NewCapturePage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  return (
    <Page eyebrow="기록함" title="새 기록">
      <Card>
        <NewCaptureForm
          userId={me.user.id}
          workspaceId={me.workspace.id}
          onCreated={(id) => navigate(`/captures/${id}`, { replace: true })}
          onCancel={() => navigate("/captures")}
        />
      </Card>
    </Page>
  );
}

function useRevisionParam(): number | undefined {
  const raw = useSearchParams()[0].get("revision");
  return raw && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : undefined;
}

/** Shared loading, missing and error states for every capture screen. */
function CaptureLoader({
  revision,
  children,
}: {
  revision?: number | undefined;
  children: (
    capture: CaptureDetail,
    refetch: () => Promise<CaptureDetail | undefined>,
  ) => ReactNode;
}) {
  const { me } = useOutletContext<ShellContext>();
  const { id = "" } = useParams();
  const query = useCapture(me.user.id, me.workspace.id, id, revision);
  if (query.isPending) return <p role="status">기록을 불러오는 중…</p>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return <NotFoundPage />;
    if (query.error instanceof ApiError && query.error.status === 403)
      return <ForbiddenPage />;
    return (
      <Notice tone="danger">
        기록을 불러오지 못했습니다.{" "}
        <Button intent="ghost" onClick={() => void query.refetch()}>
          다시 시도
        </Button>
      </Notice>
    );
  }
  return <>{children(query.data, async () => (await query.refetch()).data)}</>;
}

export function CaptureDetailPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const revision = useRevisionParam();
  return (
    <CaptureLoader revision={revision}>
      {(capture) => {
        const isLatest = capture.revision === capture.currentRevision;
        const editable = isLatest && capture.state === "ACTIVE";
        const zone = me.preferences.timeZone;
        return (
          <Page
            eyebrow="기록"
            title={capture.title}
            actions={
              editable ? (
                <>
                  <Button
                    onClick={() => navigate(`/captures/${capture.id}/edit`)}
                  >
                    수정
                  </Button>
                  <Button
                    onClick={() => navigate(`/captures/${capture.id}/split`)}
                  >
                    나누기
                  </Button>
                  <ArchiveCaptureButton
                    userId={me.user.id}
                    workspaceId={me.workspace.id}
                    capture={capture}
                    onArchived={() => navigate("/captures")}
                  />
                </>
              ) : undefined
            }
          >
            <Cluster>
              {capture.state === "ARCHIVED" && <Status>보관됨</Status>}
              <Status tone="info">
                revision {capture.revision} / {capture.currentRevision}
              </Status>
              <span className="ieum-help">
                기록 시각 {formatDateTime(capture.recordedAt, zone)}
              </span>
            </Cluster>
            {!isLatest && (
              <Notice tone="warning">
                지난 revision {capture.revision}의 원문입니다. 읽기 전용이며{" "}
                <Link to={`/captures/${capture.id}`}>최신 revision</Link>에서
                수정할 수 있습니다.
              </Notice>
            )}
            {capture.state === "ARCHIVED" && (
              <Notice tone="info">
                보관한 기록은 수정하거나 나눌 수 없습니다.
              </Notice>
            )}
            <Card title="원문">
              <p className="ieum-break" data-testid="raw-body">
                {capture.rawBody}
              </p>
            </Card>
            {capture.currentRevision > 1 && (
              <Card title="revision 이력">
                <ul className="ieum-list" aria-label="revision 이력">
                  {Array.from(
                    { length: capture.currentRevision },
                    (_, index) => {
                      const number = capture.currentRevision - index;
                      return (
                        <li key={number}>
                          <Link
                            to={
                              number === capture.currentRevision
                                ? `/captures/${capture.id}`
                                : `/captures/${capture.id}?revision=${number}`
                            }
                            {...(number === capture.revision
                              ? { "aria-current": "true" }
                              : {})}
                          >
                            revision {number}
                            {number === capture.currentRevision
                              ? " (최신)"
                              : ""}
                          </Link>
                        </li>
                      );
                    },
                  )}
                </ul>
              </Card>
            )}
            <Card title={`단위(unit) ${capture.units.length}개`}>
              <Table
                caption="이 revision의 단위"
                columns={[
                  { key: "state", label: "상태" },
                  { key: "range", label: "범위(UTF-16)" },
                  { key: "text", label: "내용" },
                  { key: "contexts", label: "맥락" },
                ]}
                rows={capture.units.map((unit) => ({
                  id: `${unit.id}-${unit.revision}`,
                  cells: {
                    contexts:
                      unit.state === "ACTIVE" && isLatest ? (
                        <UnitContextsCell
                          userId={me.user.id}
                          workspaceId={me.workspace.id}
                          unitId={unit.id}
                          editable={editable}
                        />
                      ) : (
                        "—"
                      ),
                    state: (
                      <Status
                        tone={unit.state === "ACTIVE" ? "success" : "neutral"}
                      >
                        {unit.state === "ACTIVE" ? "사용 중" : "대체됨"}
                      </Status>
                    ),
                    range: `${unit.sourceSpan.start}–${unit.sourceSpan.end}`,
                    text: (
                      <span className="ieum-break">{unit.content.text}</span>
                    ),
                  },
                }))}
              />
            </Card>
          </Page>
        );
      }}
    </CaptureLoader>
  );
}

function BlockedNotice({ id, message }: { id: string; message: string }) {
  return (
    <Stack>
      <Notice tone="warning">{message}</Notice>
      <Link to={`/captures/${id}`}>기록으로 돌아가기</Link>
    </Stack>
  );
}

export function CaptureEditPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <CaptureLoader>
      {(capture, refetch) =>
        capture.state !== "ACTIVE" ? (
          <BlockedNotice
            id={capture.id}
            message="보관한 기록은 수정할 수 없습니다."
          />
        ) : (
          <Page eyebrow="기록" title="기록 수정">
            <Card>
              <ReviseCaptureForm
                userId={me.user.id}
                workspaceId={me.workspace.id}
                capture={capture}
                onRefetch={refetch}
                onSaved={() => {
                  void queryClient.invalidateQueries({
                    queryKey: captureKeys.all(me.user.id),
                  });
                  navigate(`/captures/${capture.id}`, { replace: true });
                }}
                onCancel={() => navigate(`/captures/${capture.id}`)}
              />
            </Card>
          </Page>
        )
      }
    </CaptureLoader>
  );
}

export function CaptureSplitPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  return (
    <CaptureLoader>
      {(capture) =>
        capture.state !== "ACTIVE" ? (
          <BlockedNotice
            id={capture.id}
            message="보관한 기록은 나눌 수 없습니다."
          />
        ) : (
          <Page eyebrow="기록" title="원문 나누기">
            <Card>
              <SplitCaptureForm
                userId={me.user.id}
                workspaceId={me.workspace.id}
                capture={capture}
                onSplit={() =>
                  navigate(`/captures/${capture.id}`, { replace: true })
                }
                onCancel={() => navigate(`/captures/${capture.id}`)}
              />
            </Card>
          </Page>
        )
      }
    </CaptureLoader>
  );
}
