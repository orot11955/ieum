import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Check,
  Cluster,
  Dialog,
  Notice,
  Select,
  Stack,
} from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import {
  classifyContextError,
  contextFailureMessage,
  invalidateContexts,
  roleLabel,
  setMemberships,
  useAllContexts,
  useUnitMemberships,
  type ContextSummary,
  type MembershipRole,
  type UnitMemberships,
} from "../../entities/contexts/api";

const ROLES: MembershipRole[] = ["PRIMARY", "SECONDARY", "BACKGROUND"];

type Selection = Map<string, MembershipRole>;

function fromServer(data: UnitMemberships): Selection {
  return new Map(data.memberships.map((m) => [m.contextId, m.role]));
}

function sameSelection(a: Selection, b: Selection): boolean {
  if (a.size !== b.size) return false;
  for (const [id, role] of a) if (b.get(id) !== role) return false;
  return true;
}

function EditorBody({
  userId,
  workspaceId,
  unitId,
  data,
  contexts,
  onClose,
  onConflict,
}: {
  userId: string;
  workspaceId: string;
  unitId: string;
  data: UnitMemberships;
  contexts: ContextSummary[];
  onClose: () => void;
  onConflict: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const key = useIdempotencyKey();
  const original = fromServer(data);
  const [selection, setSelection] = useState<Selection>(() => fromServer(data));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const primaries = [...selection.values()].filter(
    (r) => r === "PRIMARY",
  ).length;
  const changed = !sameSelection(selection, original);
  // Only active contexts can be newly linked; already linked ones stay listed so they can be removed.
  const visible = contexts.filter(
    (context) => context.state === "ACTIVE" || original.has(context.id),
  );
  const toggle = (contextId: string, on: boolean) => {
    const next = new Map(selection);
    if (on) next.set(contextId, next.size === 0 ? "PRIMARY" : "SECONDARY");
    else next.delete(contextId);
    setSelection(next);
  };
  const setRole = (contextId: string, role: MembershipRole) => {
    const next = new Map(selection);
    next.set(contextId, role);
    setSelection(next);
  };
  return (
    <Stack>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {visible.length === 0 ? (
        <p className="ieum-help">
          연결할 맥락이 없습니다. 먼저 맥락을 만들어 주세요.
        </p>
      ) : (
        <ul className="ieum-list" aria-label="연결할 맥락">
          {visible.map((context) => {
            const role = selection.get(context.id);
            return (
              <li key={context.id} className="ieum-list-item">
                <Check
                  label={
                    context.state === "ACTIVE"
                      ? context.name
                      : `${context.name} (${context.state === "ARCHIVED" ? "보관됨" : "대체됨"})`
                  }
                  checked={role !== undefined}
                  onChange={(event) => toggle(context.id, event.target.checked)}
                />
                {role !== undefined && (
                  <Select
                    label={`${context.name} 역할`}
                    value={role}
                    onChange={(event) =>
                      setRole(context.id, event.target.value as MembershipRole)
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel[r]}
                      </option>
                    ))}
                  </Select>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {primaries > 1 && (
        <Notice tone="warning">대표 맥락은 하나만 지정할 수 있습니다.</Notice>
      )}
      <p className="ieum-help">
        하나의 기록을 여러 맥락에 연결할 수 있습니다. 대표 맥락은 없어도 되고,
        지정한다면 하나만 가능합니다.
      </p>
      <Cluster>
        <Button
          intent="primary"
          busy={busy}
          disabled={!changed || primaries > 1}
          disabledReason={!changed ? "바뀐 연결이 없습니다." : undefined}
          onClick={async () => {
            setBusy(true);
            setFailure("");
            const memberships = [...selection].map(([contextId, role]) => ({
              contextId,
              role,
            }));
            try {
              await setMemberships(
                workspaceId,
                unitId,
                { baseVersion: data.membershipVersion, memberships },
                key.keyFor(
                  JSON.stringify([data.membershipVersion, memberships]),
                ),
              );
              key.reset();
              await invalidateContexts(queryClient, userId);
              onClose();
            } catch (error) {
              const kind = classifyContextError(error);
              if (kind === "conflict") {
                // The whole set is replaced on save, so the latest connections must be
                // reviewed again rather than silently overwritten. The notice lives in
                // the parent because this body is rebuilt from the fresh state.
                await onConflict();
              } else setFailure(contextFailureMessage[kind]);
            } finally {
              setBusy(false);
            }
          }}
        >
          연결 저장
        </Button>
        <Button onClick={onClose}>닫기</Button>
      </Cluster>
    </Stack>
  );
}

export function UnitMembershipDialog({
  userId,
  workspaceId,
  unitId,
  title,
  open,
  onClose,
}: {
  userId: string;
  workspaceId: string;
  unitId: string;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const memberships = useUnitMemberships(userId, workspaceId, unitId);
  const all = useAllContexts(userId, workspaceId);
  // Bumping the epoch remounts the body so it starts from the fresh server state.
  const [epoch, setEpoch] = useState(0);
  const [conflictNotice, setConflictNotice] = useState(false);
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {memberships.isPending || all.isPending ? (
        <p role="status">불러오는 중…</p>
      ) : memberships.isError ||
        all.isError ||
        !memberships.data ||
        !all.data ? (
        <Notice tone="danger">연결 정보를 불러오지 못했습니다.</Notice>
      ) : (
        <>
          {!all.data.complete && (
            <Notice tone="warning">
              맥락이 매우 많아 일부만 표시합니다. 이름을 검색해 찾는 기능은
              이후에 제공됩니다.
            </Notice>
          )}
          {conflictNotice && (
            <Notice tone="warning">
              다른 곳에서 연결이 먼저 바뀌었습니다. 최신 연결을 불러왔으니 다시
              확인해 주세요.
            </Notice>
          )}
          <EditorBody
            key={`${memberships.data.membershipVersion}-${epoch}`}
            userId={userId}
            workspaceId={workspaceId}
            unitId={unitId}
            data={memberships.data}
            contexts={all.data.contexts}
            onClose={onClose}
            onConflict={async () => {
              await memberships.refetch();
              setEpoch((value) => value + 1);
              setConflictNotice(true);
            }}
          />
        </>
      )}
    </Dialog>
  );
}
