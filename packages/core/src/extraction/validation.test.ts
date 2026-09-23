import { describe, expect, it } from "vitest";
import { parseCaptureRevision } from "../model/validation.js";
import {
  prepareExtractCommand,
  validateExtractProposals,
} from "./validation.js";
import type { RawExtractCandidate } from "./validation.js";

const hash = (text: string) => {
  let sum = 0;
  for (const character of text)
    sum = (sum * 31 + character.charCodeAt(0)) >>> 0;
  return sum.toString(16).padStart(8, "0").repeat(8);
};
const rawBody = "내일 10시 회의. 다음 주 보고서 제출.";
const firstSentence = "내일 10시 회의.";
const secondSentence = "다음 주 보고서 제출.";
const capture = parseCaptureRevision({
  workspaceId: "w",
  captureId: "capture-1",
  revision: 1,
  rawBody,
  originKey: "origin-1",
  recordedAt: 100,
  occurredAt: null,
});
const candidate: RawExtractCandidate = {
  captureId: "capture-1",
  captureRevision: 1,
  sourceSpan: { start: 0, end: firstSentence.length, encoding: "utf16" },
  sourceText: firstSentence,
  targetKind: "event",
  suggestedTitle: "회의",
  suggestedBody: null,
  temporal: {
    expression: "내일 10시",
    basisEpochMs: 100,
    timeZone: null,
    proposedEpochMs: null,
    ambiguity: ["날짜와 시간대 확인"],
  },
};

describe("extraction candidate boundary", () => {
  it("keeps relative time unresolved until the user confirms time zone and instant", () => {
    const [proposal] = validateExtractProposals(
      capture,
      [candidate, candidate],
      [],
      hash,
    );
    expect(proposal).toBeDefined();
    expect(
      validateExtractProposals(capture, [candidate, candidate], [], hash),
    ).toHaveLength(1);
    expect(proposal!.unresolvedFields).toEqual([
      "time_zone",
      "start_time",
      "ambiguity",
    ]);
    expect(proposal!.status).toBe("candidate");
    expect(() =>
      prepareExtractCommand(proposal!, {
        proposalId: proposal!.proposalId,
        currentCaptureRevision: 1,
        authorized: true,
        alreadyCompletedTask: false,
        title: "회의",
        body: null,
        startEpochMs: null,
        timeZone: null,
      }),
    ).toThrow(/confirmed fields/);
    expect(
      prepareExtractCommand(proposal!, {
        proposalId: proposal!.proposalId,
        currentCaptureRevision: 1,
        authorized: true,
        alreadyCompletedTask: false,
        title: "회의",
        body: null,
        startEpochMs: 86_400_100,
        timeZone: "Asia/Seoul",
      }).startEpochMs,
    ).toBe(86_400_100);
  });

  it("rejects stale source, fabricated span, altered quote, and invalid resolved relative time", () => {
    expect(() =>
      validateExtractProposals(
        capture,
        [{ ...candidate, captureRevision: 2 }],
        [],
        hash,
      ),
    ).toThrow(/candidate/);
    expect(() =>
      validateExtractProposals(
        capture,
        [
          {
            ...candidate,
            temporal: { ...candidate.temporal!, basisEpochMs: 101 },
          },
        ],
        [],
        hash,
      ),
    ).toThrow(/basis/);
    expect(() =>
      validateExtractProposals(
        capture,
        [{ ...candidate, sourceText: "내일 회의" }],
        [],
        hash,
      ),
    ).toThrow(/source/);
    expect(() =>
      validateExtractProposals(
        capture,
        [{ ...candidate, sourceSpan: { ...candidate.sourceSpan, end: 100 } }],
        [],
        hash,
      ),
    ).toThrow(/span/);
    expect(() =>
      validateExtractProposals(
        capture,
        [
          {
            ...candidate,
            temporal: { ...candidate.temporal!, proposedEpochMs: 86_400_100 },
          },
        ],
        [],
        hash,
      ),
    ).toThrow(/unresolved/);
    const [proposal] = validateExtractProposals(capture, [candidate], [], hash);
    expect(() =>
      prepareExtractCommand(proposal!, {
        proposalId: proposal!.proposalId,
        currentCaptureRevision: 2,
        authorized: true,
        alreadyCompletedTask: false,
        title: "회의",
        body: null,
        startEpochMs: 86_400_100,
        timeZone: "Asia/Seoul",
      }),
    ).toThrow(/stale/);
    expect(() =>
      prepareExtractCommand(proposal!, {
        proposalId: proposal!.proposalId,
        currentCaptureRevision: 1,
        authorized: false,
        alreadyCompletedTask: false,
        title: "회의",
        body: null,
        startEpochMs: 86_400_100,
        timeZone: "Asia/Seoul",
      }),
    ).toThrow(/unauthorized/);
  });

  it("suppresses rejected or completed tasks across a capture revision without reopening them", () => {
    const task = { ...candidate, targetKind: "task" as const, temporal: null };
    const [first] = validateExtractProposals(capture, [task], [], hash);
    const revised = parseCaptureRevision({
      ...capture,
      revision: 2,
      rawBody: `${rawBody} 메모 추가`,
    });
    const revisedTask = { ...task, captureRevision: 2 };
    expect(
      validateExtractProposals(
        revised,
        [{ ...revisedTask, suggestedTitle: "회의 일정" }],
        [{ decisionKey: first!.decisionKey, state: "rejected" }],
        hash,
      ),
    ).toEqual([]);
    expect(
      validateExtractProposals(
        revised,
        [revisedTask],
        [{ decisionKey: first!.decisionKey, state: "completed_task" }],
        hash,
      ),
    ).toEqual([]);
    expect(() =>
      prepareExtractCommand(first!, {
        proposalId: first!.proposalId,
        currentCaptureRevision: 1,
        authorized: true,
        alreadyCompletedTask: true,
        title: "회의",
        body: null,
        startEpochMs: null,
        timeZone: null,
      }),
    ).toThrow(/stale or unauthorized/);
  });

  it("requires an explicit time expression for events and preserves next-week ambiguity", () => {
    expect(() =>
      validateExtractProposals(
        capture,
        [{ ...candidate, temporal: null }],
        [],
        hash,
      ),
    ).toThrow(/temporal/);
    const nextWeek: RawExtractCandidate = {
      ...candidate,
      sourceSpan: {
        start: rawBody.indexOf(secondSentence),
        end: rawBody.length,
        encoding: "utf16",
      },
      sourceText: secondSentence,
      targetKind: "task",
      temporal: {
        expression: "다음 주",
        basisEpochMs: 100,
        timeZone: "Asia/Seoul",
        proposedEpochMs: null,
        ambiguity: ["어느 요일인지 미정"],
      },
    };
    expect(
      validateExtractProposals(capture, [nextWeek], [], hash)[0]!
        .unresolvedFields,
    ).toEqual(["start_time", "ambiguity"]);
  });
});
