import { useState } from "react";
import { Link } from "react-router";
import { Button, Cluster, Status } from "@ieum/ui";
import {
  roleLabel,
  useAllContexts,
  useUnitMemberships,
} from "../../entities/contexts/api";
import { UnitMembershipDialog } from "./membership-editor";

/** The contexts one unit belongs to, with a way to change them when allowed. */
export function UnitContextsCell({
  userId,
  workspaceId,
  unitId,
  editable,
}: {
  userId: string;
  workspaceId: string;
  unitId: string;
  editable: boolean;
}) {
  const memberships = useUnitMemberships(userId, workspaceId, unitId);
  const all = useAllContexts(userId, workspaceId);
  const [open, setOpen] = useState(false);
  const names = new Map(
    (all.data?.contexts ?? []).map((context) => [context.id, context.name]),
  );
  return (
    <>
      {memberships.isPending ? (
        <span role="status" className="ieum-help">
          불러오는 중…
        </span>
      ) : memberships.isError ? (
        <span className="ieum-help">연결을 불러오지 못했습니다.</span>
      ) : memberships.data.memberships.length === 0 ? (
        <span className="ieum-help">연결된 맥락 없음</span>
      ) : (
        <Cluster>
          {memberships.data.memberships.map((member) => (
            <span key={member.contextId} className="ieum-break">
              <Link to={`/contexts/${member.contextId}`}>
                {names.get(member.contextId) ?? "맥락"}
              </Link>{" "}
              <Status tone={member.role === "PRIMARY" ? "success" : "neutral"}>
                {roleLabel[member.role]}
              </Status>
            </span>
          ))}
        </Cluster>
      )}
      {editable && (
        <>
          <Button intent="ghost" onClick={() => setOpen(true)}>
            맥락 연결
          </Button>
          {open && (
            <UnitMembershipDialog
              userId={userId}
              workspaceId={workspaceId}
              unitId={unitId}
              title="이 단위의 맥락 연결"
              open
              onClose={() => setOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
}
