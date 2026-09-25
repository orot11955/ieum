import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { packTransferArchive, unpackTransferArchive } from "./archive.js";
import {
  createCaptureBundle,
  createCaptureHistoryBundle,
  createContextBundle,
  createPersonalBundle,
  createTaskHistoryBundle,
  createTaskResultBundle,
  readCaptureBundle,
} from "./manifest.js";

describe("BE-21 portable capture manifest", () => {
  const workspaceId = randomUUID();
  const captureId = randomUUID();
  const record = {
    id: captureId,
    revision: 3,
    title: "원문",
    rawBody: "첫 줄\n둘째 줄",
  };

  it("round trips source identity, revision, Markdown and verified hashes", () => {
    const result = readCaptureBundle(
      createCaptureBundle(workspaceId, [record]),
    );
    expect(result.manifest.sourceWorkspaceId).toBe(workspaceId);
    expect(result.captures).toMatchObject([record]);
  });

  it("rejects unsupported schema versions and unlisted files", () => {
    const bundle = createCaptureBundle(workspaceId, [record]);
    const files = unpackTransferArchive(bundle);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    manifest.version = 8;
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("UNSUPPORTED_SCHEMA");
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          ...[...files].map(([path, bytes]) => ({ path, bytes })),
          { path: "extra.md", bytes: Buffer.from("private") },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("rejects missing or altered content and duplicate IDs", () => {
    const files = unpackTransferArchive(
      createCaptureBundle(workspaceId, [record]),
    );
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          { path: "manifest.json", bytes: files.get("manifest.json")! },
          { path: `captures/${captureId}.md`, bytes: Buffer.from("altered") },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.captures.push(manifest.captures[0]);
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          {
            path: `captures/${captureId}.md`,
            bytes: files.get(`captures/${captureId}.md`)!,
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("rejects bodies that the Capture command cannot store during validation", () => {
    for (const rawBody of [" ", "a\u0000b"]) {
      const bundle = createCaptureBundle(workspaceId, [{ ...record, rawBody }]);
      expect(() => readCaptureBundle(bundle)).toThrow("INVALID_BUNDLE");
    }
  });

  it("round trips version 2 Task/Event metadata while retaining version 1 imports", () => {
    const taskId = randomUUID();
    const eventId = randomUUID();
    const task = {
      id: taskId,
      originWorkspaceId: workspaceId,
      originId: taskId,
      title: "할일",
      description: "본문",
      state: "DONE" as const,
      version: 2,
      dueKind: "DATE" as const,
      dueDate: "2026-10-01",
      dueAt: null,
      dueTimeZone: null,
      contextId: null,
      originUnitId: null,
      originUnitRevision: null,
      completedAt: "2026-09-25T00:00:00.000Z",
      completionVersion: 2,
    };
    const event = {
      id: eventId,
      originWorkspaceId: workspaceId,
      originId: eventId,
      title: "일정",
      description: "",
      state: "CONFIRMED" as const,
      version: 1,
      scheduleKind: "ALL_DAY" as const,
      timeZone: "Asia/Seoul",
      startAt: null,
      endAt: null,
      startLocal: null,
      endLocal: null,
      startOffsetMinutes: null,
      endOffsetMinutes: null,
      startDate: "2026-10-02",
      endDateExclusive: "2026-10-03",
    };
    const parsed = readCaptureBundle(
      createPersonalBundle(workspaceId, [record], [task], [event]),
    );
    expect(parsed.manifest.version).toBe(2);
    if (parsed.manifest.version !== 2) throw new Error("expected v2");
    expect(parsed.manifest.tasks).toEqual([task]);
    expect(parsed.manifest.events).toEqual([event]);
    expect(
      readCaptureBundle(createCaptureBundle(workspaceId, [record])).manifest
        .version,
    ).toBe(1);
  });

  it("rejects malformed version 2 dates and timezone before staging", () => {
    const eventId = randomUUID();
    const bundle = createPersonalBundle(
      workspaceId,
      [],
      [],
      [
        {
          id: eventId,
          originWorkspaceId: workspaceId,
          originId: eventId,
          title: "일정",
          description: "",
          state: "CONFIRMED",
          version: 1,
          scheduleKind: "ALL_DAY",
          timeZone: "Asia/Seoul",
          startAt: null,
          endAt: null,
          startLocal: null,
          endLocal: null,
          startOffsetMinutes: null,
          endOffsetMinutes: null,
          startDate: "2026-10-02",
          endDateExclusive: "2026-10-03",
        },
      ],
    );
    const files = unpackTransferArchive(bundle);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    manifest.events[0].timeZone = "Invalid/NoSuchZone";
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.events[0].timeZone = "Asia/Seoul";
    manifest.events[0].startDate = "2026-02-30";
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("accepts a Task due timezone already accepted by the Task API", () => {
    const taskId = randomUUID();
    const bundle = createPersonalBundle(
      workspaceId,
      [],
      [
        {
          id: taskId,
          originWorkspaceId: workspaceId,
          originId: taskId,
          title: "GMT 마감",
          description: "",
          state: "TODO",
          version: 1,
          dueKind: "INSTANT",
          dueDate: null,
          dueAt: "2026-10-01T00:00:00.000Z",
          dueTimeZone: "GMT",
          contextId: null,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: null,
          completionVersion: null,
        },
      ],
      [],
    );
    expect(readCaptureBundle(bundle).manifest.version).toBe(2);
  });

  it("round trips version 3 Context identity and accepts split supersession", () => {
    const contextId = randomUUID();
    const context = {
      id: contextId,
      originWorkspaceId: workspaceId,
      originId: contextId,
      name: "주제",
      purpose: "목적",
      scope: "범위",
      kind: "TOPIC" as const,
      state: "ACTIVE" as const,
      supersededById: null,
      identityRevision: 2,
      membershipRevision: 3,
    };
    const bundle = createContextBundle(workspaceId, [], [], [], [context]);
    const parsed = readCaptureBundle(bundle);
    expect(parsed.manifest.version).toBe(3);
    if (parsed.manifest.version !== 3) throw new Error("expected v3");
    expect(parsed.manifest.contexts).toEqual([context]);
    const manifest = JSON.parse(
      unpackTransferArchive(bundle).get("manifest.json")!.toString("utf8"),
    );
    manifest.contexts[0].state = "SUPERSEDED";
    const splitBundle = packTransferArchive([
      {
        path: "manifest.json",
        bytes: Buffer.from(JSON.stringify(manifest)),
      },
    ]);
    expect(readCaptureBundle(splitBundle).manifest.version).toBe(3);
    manifest.contexts[0].state = "ACTIVE";
    manifest.contexts[0].supersededById = randomUUID();
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("round trips version 4 Task transitions and rejects an inconsistent chain", () => {
    const taskId = randomUUID();
    const task = {
      id: taskId,
      originWorkspaceId: workspaceId,
      originId: taskId,
      title: "상태 이력",
      description: "",
      state: "DONE" as const,
      version: 4,
      dueKind: "NONE" as const,
      dueDate: null,
      dueAt: null,
      dueTimeZone: null,
      contextId: null,
      originUnitId: null,
      originUnitRevision: null,
      completedAt: "2026-09-25T00:00:00.000Z",
      completionVersion: 4,
    };
    const transitions = [
      {
        taskId,
        version: 2,
        fromState: "TODO" as const,
        toState: "IN_PROGRESS" as const,
        recordedAt: "2026-09-24T00:00:00.000Z",
      },
      {
        taskId,
        version: 4,
        fromState: "IN_PROGRESS" as const,
        toState: "DONE" as const,
        recordedAt: "2026-09-25T00:00:00.000Z",
      },
    ];
    const bundle = createTaskHistoryBundle(
      workspaceId,
      [],
      [task],
      [],
      [],
      transitions,
    );
    const parsed = readCaptureBundle(bundle).manifest;
    expect(parsed.version).toBe(4);
    if (parsed.version !== 4) throw new Error("expected v4");
    expect(parsed.taskTransitions).toEqual(transitions);
    const manifest = JSON.parse(
      unpackTransferArchive(bundle).get("manifest.json")!.toString("utf8"),
    );
    manifest.taskTransitions[1].fromState = "TODO";
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.taskTransitions[1].fromState = "IN_PROGRESS";
    manifest.tasks[0].completionVersion = 2;
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.tasks[0].completionVersion = 4;
    manifest.taskTransitions[0].toState = "CANCELED";
    manifest.taskTransitions[1].fromState = "CANCELED";
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("requires version 5 Task results to reference a Capture and DONE transition", () => {
    const taskId = randomUUID();
    const captureId = randomUUID();
    const resultId = randomUUID();
    const bundle = createTaskResultBundle(
      workspaceId,
      [{ id: captureId, revision: 1, title: "결과", rawBody: "본문" }],
      [
        {
          id: taskId,
          originWorkspaceId: workspaceId,
          originId: taskId,
          title: "완료",
          description: "",
          state: "DONE",
          version: 2,
          dueKind: "NONE",
          dueDate: null,
          dueAt: null,
          dueTimeZone: null,
          contextId: null,
          originUnitId: null,
          originUnitRevision: null,
          completedAt: "2026-09-25T00:00:00.000Z",
          completionVersion: 2,
        },
      ],
      [],
      [],
      [
        {
          taskId,
          version: 2,
          fromState: "TODO",
          toState: "DONE",
          recordedAt: "2026-09-25T00:00:00.000Z",
        },
      ],
      [
        {
          id: resultId,
          originWorkspaceId: workspaceId,
          originId: resultId,
          taskId,
          captureId,
          completionVersion: 2,
          recordedAt: "2026-09-25T00:01:00.000Z",
        },
      ],
    );
    expect(readCaptureBundle(bundle).manifest.version).toBe(5);
    const files = unpackTransferArchive(bundle);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    manifest.taskResults[0].taskId = taskId.toUpperCase();
    manifest.taskResults[0].captureId = captureId.toUpperCase();
    manifest.taskTransitions[0].taskId = taskId.toUpperCase();
    expect(
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ).manifest.version,
    ).toBe(5);
    manifest.taskResults[0].taskId = taskId;
    manifest.taskResults[0].captureId = captureId;
    manifest.taskTransitions[0].taskId = taskId;
    manifest.taskResults[0].captureId = randomUUID();
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.taskResults[0].captureId = captureId;
    manifest.taskTransitions = [];
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    const duplicate = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    const otherTaskId = randomUUID();
    duplicate.tasks.push({
      ...duplicate.tasks[0],
      id: otherTaskId,
      originId: otherTaskId,
    });
    duplicate.taskTransitions.push({
      ...duplicate.taskTransitions[0],
      taskId: otherTaskId,
    });
    const otherResultId = randomUUID();
    duplicate.taskResults.push({
      ...duplicate.taskResults[0],
      id: otherResultId,
      originId: otherResultId,
      taskId: otherTaskId,
    });
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(duplicate)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    const otherCaptureId = randomUUID();
    const otherCapturePath = `captures/${otherCaptureId}.md`;
    duplicate.captures.push({
      ...duplicate.captures[0],
      id: otherCaptureId,
      originCaptureId: otherCaptureId,
      path: otherCapturePath,
    });
    duplicate.taskResults[1].captureId = otherCaptureId;
    duplicate.taskResults[1].originId = resultId.toUpperCase();
    expect(
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(duplicate)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
          {
            path: otherCapturePath,
            bytes: files.get(`captures/${captureId}.md`)!,
          },
        ]),
      ).manifest.version,
    ).toBe(5);
  });

  it("keeps version 6 Capture revisions and rejects a missing historical revision", () => {
    const id = randomUUID();
    const bundle = createCaptureHistoryBundle(
      workspaceId,
      [
        {
          id,
          revision: 3,
          title: "현재",
          rawBody: "셋째",
          recordedAt: "2026-09-25T00:00:00.000Z",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      [
        {
          captureId: id,
          revision: 1,
          title: "첫째",
          rawBody: "첫째",
          recordedAt: "2026-09-23T00:00:00.000Z",
        },
        {
          captureId: id,
          revision: 2,
          title: "둘째",
          rawBody: "둘째",
          recordedAt: "2026-09-24T00:00:00.000Z",
        },
      ],
    );
    const parsed = readCaptureBundle(bundle);
    expect(parsed.manifest.version).toBe(6);
    expect(parsed.captureRevisions.map((revision) => revision.rawBody)).toEqual(
      ["첫째", "둘째"],
    );
    const files = unpackTransferArchive(bundle);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    manifest.captureRevisions.pop();
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(
              ([path]) =>
                path !== "manifest.json" && path !== `captures/${id}/2.md`,
            )
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });

  it("keeps version 7 Unit identity and rejects a quote outside its source span", () => {
    const captureId = randomUUID();
    const unitId = randomUUID();
    const recordedAt = "2026-09-25T00:00:00.000Z";
    const bundle = createCaptureHistoryBundle(
      workspaceId,
      [
        {
          id: captureId,
          revision: 1,
          title: "원문",
          rawBody: "가나",
          recordedAt,
          version: 1,
          unitSetVersion: 2,
          state: "ACTIVE",
          originKey: "fixture",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: unitId,
          originWorkspaceId: workspaceId,
          originId: unitId,
          captureId,
          captureRevision: 1,
          originKey: "fixture",
          state: "ACTIVE",
          currentRevision: 1,
          createdAt: recordedAt,
          supersededAt: null,
          revisions: [
            {
              revision: 1,
              sourceStart: 0,
              sourceEnd: 2,
              contentKind: "quote",
              contentText: "가나",
              recordedAt,
            },
          ],
        },
      ],
    );
    const parsed = readCaptureBundle(bundle);
    expect(parsed.manifest.version).toBe(7);
    if (parsed.manifest.version !== 7) throw new Error("expected v7");
    expect(parsed.manifest.units[0]?.id).toBe(unitId);
    const files = unpackTransferArchive(bundle);
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8"));
    manifest.units[0].revisions[0].contentText = "나가";
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
    manifest.units[0].revisions[0].contentKind = "paraphrase";
    manifest.units[0].revisions[0].contentText = "\ud800";
    expect(() =>
      readCaptureBundle(
        packTransferArchive([
          {
            path: "manifest.json",
            bytes: Buffer.from(JSON.stringify(manifest)),
          },
          ...[...files]
            .filter(([path]) => path !== "manifest.json")
            .map(([path, bytes]) => ({ path, bytes })),
        ]),
      ),
    ).toThrow("INVALID_BUNDLE");
  });
});
