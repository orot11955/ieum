import assert from "node:assert/strict";
import test from "node:test";
import { validateSnapshot } from "@ieum/core";
import {
  findExactLexicalSources,
  retrieveExactLexicalCandidates,
} from "./exact-finder.js";

function capture(captureId: string, text: string) {
  return {
    workspaceId: "w1",
    captureId,
    revision: 1,
    rawBody: text,
    originKey: `origin:${captureId}`,
    recordedAt: 100,
    occurredAt: null,
  };
}

function unit(source: ReturnType<typeof capture>, unitId: string) {
  return {
    workspaceId: "w1",
    unitId,
    revision: 1,
    captureId: source.captureId,
    captureRevision: 1,
    originKey: source.originKey,
    sourceSpan: { start: 0, end: source.rawBody.length, encoding: "utf16" },
    content: { kind: "quote", text: source.rawBody },
    recordedAt: 100,
  };
}

function fixture() {
  const query = capture("query", "여행 기록 PRIVATE_QUERY");
  const member = capture("member", "여행 기록 PRIVATE_MEMBER");
  const unrelated = capture("unrelated", "완료 보고 PRIVATE_OTHER");
  return validateSnapshot(
    {
      workspaceId: "w1",
      asOfRecordedAt: 100,
      query: { unitId: "uq", revision: 1 },
      captures: [query, member, unrelated],
      units: [unit(query, "uq"), unit(member, "um"), unit(unrelated, "uo")],
      contexts: [
        {
          workspaceId: "w1",
          contextId: "identity",
          identityRevision: 1,
          membershipRevision: 1,
          name: "여행 계획",
          recordedAt: 100,
          memberUnits: [],
        },
        {
          workspaceId: "w1",
          contextId: "member-only",
          identityRevision: 1,
          membershipRevision: 1,
          name: "무관한 이름",
          recordedAt: 100,
          memberUnits: [{ unitId: "um", revision: 1 }],
        },
        {
          workspaceId: "w1",
          contextId: "unrelated",
          identityRevision: 1,
          membershipRevision: 1,
          name: "완료 보고",
          recordedAt: 100,
          memberUnits: [{ unitId: "uo", revision: 1 }],
        },
      ],
      relations: [],
      visibility: [],
      profileWatermarks: [],
    },
    "a".repeat(64),
  );
}

test("exact finder scans identity and members separately and preserves member-only recall", () => {
  const snapshot = fixture();
  const sources = findExactLexicalSources(snapshot);
  assert.equal(sources.identity.status, "ok");
  assert.equal(sources.member.status, "ok");
  if (sources.identity.status !== "ok" || sources.member.status !== "ok")
    return;
  assert.equal(
    sources.identity.hits.some((hit) => hit.contextId === "identity"),
    true,
  );
  assert.equal(
    sources.identity.hits.some((hit) => hit.contextId === "member-only"),
    false,
  );
  assert.equal(
    sources.member.hits.some((hit) => hit.contextId === "member-only"),
    true,
  );
  assert.equal(
    sources.member.hits.some((hit) => hit.contextId === "identity"),
    false,
  );
  const result = retrieveExactLexicalCandidates(snapshot);
  assert.deepEqual(result.candidates.map((item) => item.contextId).sort(), [
    "identity",
    "member-only",
  ]);
  assert.equal(result.matchedContextCount, 2);
  assert.equal(JSON.stringify(result).includes("PRIVATE_"), false);
  const exhaustive = retrieveExactLexicalCandidates(snapshot, "all");
  assert.equal(exhaustive.candidates.length, 3);
  assert.equal(
    exhaustive.candidates.find((item) => item.contextId === "unrelated")
      ?.matchStatus,
    "exhaustive_only",
  );
  assert.equal(exhaustive.matchedContextCount, 2);
});
