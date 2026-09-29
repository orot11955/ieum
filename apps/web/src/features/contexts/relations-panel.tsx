import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Cluster, Notice, Select, Stack } from "@ieum/ui";
import { useIdempotencyKey } from "../../shared/api/idempotency";
import {
  addContextRelation,
  classifyContextError,
  contextFailureMessage,
  endContextRelation,
  invalidateContexts,
  useAllContexts,
  type ContextDetail,
  type RelationType,
} from "../../entities/contexts/api";

type Direction = "parent" | "child" | "related";
const directionLabel: Record<Direction, string> = {
  parent: "대상이 이 맥락의 상위",
  child: "대상이 이 맥락의 하위",
  related: "대상과 서로 관련",
};

function relationRequest(
  direction: Direction,
  thisId: string,
  targetId: string,
): { fromContextId: string; toContextId: string; type: RelationType } {
  if (direction === "parent")
    return { fromContextId: targetId, toContextId: thisId, type: "PARENT_OF" };
  if (direction === "child")
    return { fromContextId: thisId, toContextId: targetId, type: "PARENT_OF" };
  return { fromContextId: thisId, toContextId: targetId, type: "RELATED_TO" };
}

export function RelationsPanel({
  userId,
  workspaceId,
  context,
  editable,
}: {
  userId: string;
  workspaceId: string;
  context: ContextDetail;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const addKey = useIdempotencyKey();
  const endKey = useIdempotencyKey();
  const all = useAllContexts(userId, workspaceId);
  const [direction, setDirection] = useState<Direction>("related");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const names = new Map(
    (all.data?.contexts ?? []).map((item) => [item.id, item.name]),
  );
  const candidates = (all.data?.contexts ?? []).filter(
    (item) => item.state === "ACTIVE" && item.id !== context.id,
  );

  const describe = (relation: ContextDetail["relations"][number]) => {
    const otherId =
      relation.fromContextId === context.id
        ? relation.toContextId
        : relation.fromContextId;
    const kind =
      relation.type === "RELATED_TO"
        ? "관련"
        : relation.fromContextId === context.id
          ? "하위"
          : "상위";
    return { otherId, kind };
  };

  return (
    <Stack>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {context.relations.length === 0 ? (
        <p className="ieum-help">연결된 맥락이 없습니다.</p>
      ) : (
        <ul className="ieum-list" aria-label="맥락 관계">
          {context.relations.map((relation) => {
            const { otherId, kind } = describe(relation);
            return (
              <li key={relation.id} className="ieum-list-item">
                <div>
                  <span className="ieum-kicker">{kind}</span>{" "}
                  <Link to={`/contexts/${otherId}`} className="ieum-break">
                    {names.get(otherId) ?? "맥락"}
                  </Link>
                </div>
                {editable && (
                  <Button
                    intent="ghost"
                    busy={busy === relation.id}
                    aria-label={`${names.get(otherId) ?? "맥락"} 연결 끊기`}
                    onClick={async () => {
                      setBusy(relation.id);
                      setFailure("");
                      try {
                        await endContextRelation(
                          workspaceId,
                          relation.id,
                          endKey.keyFor(relation.id),
                        );
                        endKey.reset();
                        await invalidateContexts(queryClient, userId);
                      } catch (error) {
                        setFailure(
                          contextFailureMessage[classifyContextError(error)],
                        );
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    연결 끊기
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <Cluster>
          <Select
            label="관계"
            value={direction}
            onChange={(event) => setDirection(event.target.value as Direction)}
          >
            {(Object.keys(directionLabel) as Direction[]).map((value) => (
              <option key={value} value={value}>
                {directionLabel[value]}
              </option>
            ))}
          </Select>
          <Select
            label="대상 맥락"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">선택</option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Button
            intent="primary"
            disabled={!target}
            busy={busy === "add"}
            onClick={async () => {
              setBusy("add");
              setFailure("");
              const body = relationRequest(direction, context.id, target);
              try {
                await addContextRelation(
                  workspaceId,
                  body,
                  addKey.keyFor(JSON.stringify(body)),
                );
                addKey.reset();
                setTarget("");
                await invalidateContexts(queryClient, userId);
              } catch (error) {
                setFailure(contextFailureMessage[classifyContextError(error)]);
              } finally {
                setBusy(null);
              }
            }}
          >
            관계 추가
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
