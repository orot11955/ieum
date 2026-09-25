import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { packTransferArchive, unpackTransferArchive } from "./archive.js";
import {
  createCaptureBundle,
  createContextBundle,
  createPersonalBundle,
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
    manifest.version = 4;
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
});
