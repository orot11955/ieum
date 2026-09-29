import { useState } from "react";
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
  Dialog,
  Empty,
  Field,
  Notice,
  Page,
  Status,
} from "@ieum/ui";
import type { ShellContext } from "../app/shell";
import {
  changeContext,
  classifyContextError,
  contextFailureMessage,
  createContext,
  invalidateContexts,
  kindLabel,
  roleLabel,
  useContext,
  useContextList,
  type ContextDetail,
} from "../entities/contexts/api";
import { ApiError } from "../shared/api/http";
import { useIdempotencyKey } from "../shared/api/idempotency";
import { formatDateTime } from "../shared/format";
import { ContextForm } from "../features/contexts/context-form";
import { UnitMembershipDialog } from "../features/contexts/membership-editor";
import { RelationsPanel } from "../features/contexts/relations-panel";
import { ForbiddenPage, NotFoundPage } from "./app-pages";

export function ContextListPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get("archived") === "1";
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const list = useContextList(me.user.id, me.workspace.id, includeArchived, q);
  const contexts = list.data?.pages.flatMap((page) => page.contexts) ?? [];
  const update = (next: { archived?: boolean; q?: string }) => {
    const archived = next.archived ?? includeArchived;
    const query = next.q ?? q;
    const result: Record<string, string> = {};
    if (archived) result.archived = "1";
    if (query) result.q = query;
    setParams(result, { replace: true });
  };
  return (
    <Page
      eyebrow="맥락"
      title="맥락"
      actions={
        <Button intent="primary" onClick={() => navigate("/contexts/new")}>
          새 맥락
        </Button>
      }
    >
      <form
        role="search"
        className="ieum-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <div className="ieum-grow">
          <Field
            label="이름 검색"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button type="submit">검색</Button>
      </form>
      <Check
        label="보관한 맥락도 보기"
        checked={includeArchived}
        onChange={(event) => update({ archived: event.target.checked })}
      />
      {list.isPending ? (
        <p role="status">맥락을 불러오는 중…</p>
      ) : list.isError ? (
        <Notice tone="danger">
          맥락을 불러오지 못했습니다.{" "}
          <Button intent="ghost" onClick={() => void list.refetch()}>
            다시 시도
          </Button>
        </Notice>
      ) : contexts.length === 0 ? (
        <Empty>
          {q
            ? "검색 결과가 없습니다."
            : "아직 맥락이 없습니다. 기록을 함께 보는 이유가 있는 묶음을 만들어 보세요."}
        </Empty>
      ) : (
        <ul className="ieum-list" aria-label="맥락 목록">
          {contexts.map((context) => (
            <li key={context.id} className="ieum-list-item">
              <div>
                <Link to={`/contexts/${context.id}`} className="ieum-break">
                  {context.name}
                </Link>
                <p className="ieum-help ieum-break">{context.purpose}</p>
              </div>
              <Cluster>
                <Status tone="info">{kindLabel[context.kind]}</Status>
                {context.state !== "ACTIVE" && (
                  <Status>
                    {context.state === "ARCHIVED" ? "보관됨" : "대체됨"}
                  </Status>
                )}
              </Cluster>
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

export function NewContextPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  let createdId = "";
  return (
    <Page eyebrow="맥락" title="새 맥락">
      <Card>
        <ContextForm
          initial={{ name: "", purpose: "", scope: "", kind: "TOPIC" }}
          submitLabel="맥락 만들기"
          save={async (values, key) => {
            createdId = (await createContext(me.workspace.id, values, key)).id;
            await invalidateContexts(queryClient, me.user.id);
          }}
          onSaved={() => navigate(`/contexts/${createdId}`, { replace: true })}
          onCancel={() => navigate("/contexts")}
        />
      </Card>
    </Page>
  );
}

function ContextLoader({
  children,
}: {
  children: (
    context: ContextDetail,
    refetch: () => Promise<ContextDetail | undefined>,
  ) => React.ReactNode;
}) {
  const { me } = useOutletContext<ShellContext>();
  const { id = "" } = useParams();
  const query = useContext(me.user.id, me.workspace.id, id);
  if (query.isPending) return <p role="status">맥락을 불러오는 중…</p>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return <NotFoundPage />;
    if (query.error instanceof ApiError && query.error.status === 403)
      return <ForbiddenPage />;
    return (
      <Notice tone="danger">
        맥락을 불러오지 못했습니다.{" "}
        <Button intent="ghost" onClick={() => void query.refetch()}>
          다시 시도
        </Button>
      </Notice>
    );
  }
  return <>{children(query.data, async () => (await query.refetch()).data)}</>;
}

function ArchiveContextButton({
  context,
  userId,
  workspaceId,
  onArchived,
}: {
  context: ContextDetail;
  userId: string;
  workspaceId: string;
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
        title="이 맥락을 보관할까요?"
        onClose={() => setOpen(false)}
      >
        <p>
          보관한 맥락은 기본 목록에서 빠지고 새 기록을 연결할 수 없습니다. 이미
          연결된 기록과 원문은 그대로 남습니다.
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
                await changeContext(
                  workspaceId,
                  context.id,
                  {
                    baseRevision: context.currentIdentityRevision,
                    state: "ARCHIVED",
                  },
                  key.keyFor(String(context.currentIdentityRevision)),
                );
                key.reset();
                await invalidateContexts(queryClient, userId);
                setOpen(false);
                onArchived();
              } catch (error) {
                const kind = classifyContextError(error);
                setFailure(
                  kind === "conflict"
                    ? "다른 곳에서 먼저 바뀌었습니다. 맥락을 다시 열어 확인해 주세요."
                    : contextFailureMessage[kind],
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

export function ContextDetailPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  return (
    <ContextLoader>
      {(context) => {
        const active = context.state === "ACTIVE";
        return (
          <Page
            eyebrow="맥락"
            title={context.name}
            actions={
              active ? (
                <>
                  <Button
                    onClick={() => navigate(`/contexts/${context.id}/edit`)}
                  >
                    수정
                  </Button>
                  <ArchiveContextButton
                    context={context}
                    userId={me.user.id}
                    workspaceId={me.workspace.id}
                    onArchived={() => navigate("/contexts")}
                  />
                </>
              ) : undefined
            }
          >
            <Cluster>
              <Status tone="info">{kindLabel[context.kind]}</Status>
              {!active && (
                <Status>
                  {context.state === "ARCHIVED" ? "보관됨" : "대체됨"}
                </Status>
              )}
              <span className="ieum-help">
                revision {context.currentIdentityRevision} · 만든 시각{" "}
                {formatDateTime(context.createdAt, me.preferences.timeZone)}
              </span>
            </Cluster>
            {!active && (
              <Notice tone="info">
                {context.state === "ARCHIVED" ? "보관한" : "대체된"} 맥락은
                수정하거나 새로 연결할 수 없습니다.
              </Notice>
            )}
            <Card title="목적">
              <p className="ieum-break" data-testid="context-purpose">
                {context.purpose}
              </p>
            </Card>
            <Card title="범위">
              <p className="ieum-break">{context.scope}</p>
            </Card>
            <Card title={`연결된 기록 ${context.memberships.length}개`}>
              {context.memberships.length === 0 ? (
                <p className="ieum-help">
                  이 맥락에 연결된 기록이 없습니다. 기록 상세의 단위(unit)에서
                  연결할 수 있습니다.
                </p>
              ) : (
                <ul className="ieum-list" aria-label="연결된 기록">
                  {context.memberships.map((member) => (
                    <li key={member.unitId} className="ieum-list-item">
                      <div>
                        <Link
                          to={`/captures/${member.captureId}`}
                          className="ieum-break"
                        >
                          {member.captureTitle}
                        </Link>
                        <p className="ieum-break">
                          {member.excerpt}
                          {member.truncated ? "…" : ""}
                        </p>
                      </div>
                      <Cluster>
                        <Status>{roleLabel[member.role]}</Status>
                        <Button
                          intent="ghost"
                          aria-label={`${member.captureTitle} 연결 편집`}
                          onClick={() => setEditingUnit(member.unitId)}
                        >
                          연결 편집
                        </Button>
                      </Cluster>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="맥락 관계">
              <RelationsPanel
                userId={me.user.id}
                workspaceId={me.workspace.id}
                context={context}
                editable={active}
              />
            </Card>
            {editingUnit && (
              <UnitMembershipDialog
                userId={me.user.id}
                workspaceId={me.workspace.id}
                unitId={editingUnit}
                title="기록의 맥락 연결"
                open
                onClose={() => setEditingUnit(null)}
              />
            )}
          </Page>
        );
      }}
    </ContextLoader>
  );
}

export function ContextEditPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <ContextLoader>
      {(context, refetch) =>
        context.state !== "ACTIVE" ? (
          <>
            <Notice tone="warning">
              보관했거나 대체된 맥락은 수정할 수 없습니다.
            </Notice>
            <Link to={`/contexts/${context.id}`}>맥락으로 돌아가기</Link>
          </>
        ) : (
          <Page eyebrow="맥락" title="맥락 수정">
            <Card>
              <ContextForm
                initial={{
                  name: context.name,
                  purpose: context.purpose,
                  scope: context.scope,
                  kind: context.kind,
                }}
                submitLabel="새 revision으로 저장"
                requireChange
                refetchLatest={refetch}
                save={async (values, key) => {
                  await changeContext(
                    me.workspace.id,
                    context.id,
                    {
                      baseRevision: context.currentIdentityRevision,
                      ...values,
                    },
                    key,
                  );
                  await invalidateContexts(queryClient, me.user.id);
                }}
                onSaved={() =>
                  navigate(`/contexts/${context.id}`, { replace: true })
                }
                onCancel={() => navigate(`/contexts/${context.id}`)}
              />
            </Card>
          </Page>
        )
      }
    </ContextLoader>
  );
}
