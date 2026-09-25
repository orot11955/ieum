import {
  TransferManifestSchema,
  TransferManifestV2Schema,
  TransferManifestV3Schema,
  TransferManifestV4Schema,
  TransferManifestV5Schema,
  TransferManifestV6Schema,
  type TransferManifest,
  type TransferManifestV2,
  type TransferManifestV3,
  type TransferManifestV4,
  type TransferManifestV5,
  type TransferManifestV6,
} from "@ieum/contracts/data-transfer";
import {
  packTransferArchive,
  transferHash,
  unpackTransferArchive,
} from "./archive.js";
import { validRawBody, validText } from "../captures.js";
import { taskTransitionAllowed } from "../tasks.js";
import {
  resolveLocalTime,
  timeZoneFormat,
  validCalendarDate,
} from "../calendar-time.js";

export class TransferManifestError extends Error {
  constructor(public readonly code: "UNSUPPORTED_SCHEMA" | "INVALID_BUNDLE") {
    super(code);
  }
}

export function createCaptureBundle(
  sourceWorkspaceId: string,
  records: {
    id: string;
    revision: number;
    title: string;
    rawBody: string;
    originWorkspaceId?: string;
    originCaptureId?: string;
  }[],
): Buffer {
  const files = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestSchema.parse({
    format: "ieum-personal",
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: files[index]!.path,
      sha256: transferHash(files[index]!.bytes),
    })),
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...files,
  ]);
}

export function createPersonalBundle(
  sourceWorkspaceId: string,
  records: Parameters<typeof createCaptureBundle>[1],
  tasks: TransferManifestV2["tasks"],
  events: TransferManifestV2["events"],
): Buffer {
  const files = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestV2Schema.parse({
    format: "ieum-personal",
    version: 2,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: files[index]!.path,
      sha256: transferHash(files[index]!.bytes),
    })),
    tasks,
    events,
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...files,
  ]);
}

export function createContextBundle(
  sourceWorkspaceId: string,
  records: Parameters<typeof createCaptureBundle>[1],
  tasks: TransferManifestV3["tasks"],
  events: TransferManifestV3["events"],
  contexts: TransferManifestV3["contexts"],
): Buffer {
  const files = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestV3Schema.parse({
    format: "ieum-personal",
    version: 3,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: files[index]!.path,
      sha256: transferHash(files[index]!.bytes),
    })),
    tasks,
    events,
    contexts,
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...files,
  ]);
}

export function createTaskHistoryBundle(
  sourceWorkspaceId: string,
  records: Parameters<typeof createCaptureBundle>[1],
  tasks: TransferManifestV4["tasks"],
  events: TransferManifestV4["events"],
  contexts: TransferManifestV4["contexts"],
  taskTransitions: TransferManifestV4["taskTransitions"],
): Buffer {
  const files = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestV4Schema.parse({
    format: "ieum-personal",
    version: 4,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: files[index]!.path,
      sha256: transferHash(files[index]!.bytes),
    })),
    tasks,
    events,
    contexts,
    taskTransitions,
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...files,
  ]);
}

export function createTaskResultBundle(
  sourceWorkspaceId: string,
  records: Parameters<typeof createCaptureBundle>[1],
  tasks: TransferManifestV5["tasks"],
  events: TransferManifestV5["events"],
  contexts: TransferManifestV5["contexts"],
  taskTransitions: TransferManifestV5["taskTransitions"],
  taskResults: TransferManifestV5["taskResults"],
): Buffer {
  const files = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestV5Schema.parse({
    format: "ieum-personal",
    version: 5,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: files[index]!.path,
      sha256: transferHash(files[index]!.bytes),
    })),
    tasks,
    events,
    contexts,
    taskTransitions,
    taskResults,
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...files,
  ]);
}

export function createCaptureHistoryBundle(
  sourceWorkspaceId: string,
  records: (Parameters<typeof createCaptureBundle>[1][number] & {
    recordedAt: string;
  })[],
  tasks: TransferManifestV6["tasks"],
  events: TransferManifestV6["events"],
  contexts: TransferManifestV6["contexts"],
  taskTransitions: TransferManifestV6["taskTransitions"],
  taskResults: TransferManifestV6["taskResults"],
  history: (Omit<
    TransferManifestV6["captureRevisions"][number],
    "path" | "sha256"
  > & {
    rawBody: string;
  })[],
): Buffer {
  const currentFiles = records.map((record) => ({
    path: `captures/${record.id}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const historyFiles = history.map((record) => ({
    path: `captures/${record.captureId}/${record.revision}.md`,
    bytes: Buffer.from(record.rawBody, "utf8"),
  }));
  const manifest = TransferManifestV6Schema.parse({
    format: "ieum-personal",
    version: 6,
    exportedAt: new Date().toISOString(),
    sourceWorkspaceId,
    captures: records.map((record, index) => ({
      id: record.id,
      revision: record.revision,
      title: record.title,
      recordedAt: record.recordedAt,
      originWorkspaceId: record.originWorkspaceId ?? sourceWorkspaceId,
      originCaptureId: record.originCaptureId ?? record.id,
      path: currentFiles[index]!.path,
      sha256: transferHash(currentFiles[index]!.bytes),
    })),
    captureRevisions: history.map((record, index) => ({
      captureId: record.captureId,
      revision: record.revision,
      title: record.title,
      recordedAt: record.recordedAt,
      path: historyFiles[index]!.path,
      sha256: transferHash(historyFiles[index]!.bytes),
    })),
    tasks,
    events,
    contexts,
    taskTransitions,
    taskResults,
  });
  return packTransferArchive([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest)) },
    ...currentFiles,
    ...historyFiles,
  ]);
}

export function readCaptureBundle(packed: Buffer): {
  manifest:
    | TransferManifest
    | TransferManifestV2
    | TransferManifestV3
    | TransferManifestV4
    | TransferManifestV5
    | TransferManifestV6;
  captures: (TransferManifest["captures"][number] & { rawBody: string })[];
  captureRevisions: (Omit<
    TransferManifestV6["captureRevisions"][number],
    "path" | "sha256"
  > & {
    rawBody: string;
  })[];
} {
  const files = unpackTransferArchive(packed);
  const manifestBytes = files.get("manifest.json");
  if (!manifestBytes) throw new TransferManifestError("INVALID_BUNDLE");
  if (
    !Buffer.from(manifestBytes.toString("utf8"), "utf8").equals(manifestBytes)
  )
    throw new TransferManifestError("INVALID_BUNDLE");
  let input: unknown;
  try {
    input = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new TransferManifestError("INVALID_BUNDLE");
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version !== 1 &&
    input.version !== 2 &&
    input.version !== 3 &&
    input.version !== 4 &&
    input.version !== 5 &&
    input.version !== 6
  )
    throw new TransferManifestError("UNSUPPORTED_SCHEMA");
  const parsed = TransferManifestSchema.safeParse(input);
  if (!parsed.success) throw new TransferManifestError("INVALID_BUNDLE");
  const manifest = parsed.data;
  if (manifest.version !== 1) {
    for (const task of manifest.tasks) {
      if (
        !validText(task.title, 300) ||
        task.description.includes("\u0000") ||
        (task.dueDate !== null && !validCalendarDate(task.dueDate)) ||
        (task.dueTimeZone !== null && !validTaskTimeZone(task.dueTimeZone)) ||
        (task.dueKind === "NONE" &&
          (task.dueDate !== null ||
            task.dueAt !== null ||
            task.dueTimeZone !== null)) ||
        (task.dueKind === "DATE" &&
          (task.dueDate === null ||
            task.dueAt !== null ||
            task.dueTimeZone !== null)) ||
        (task.dueKind === "INSTANT" &&
          (task.dueDate !== null ||
            task.dueAt === null ||
            task.dueTimeZone === null)) ||
        (task.originUnitId === null) !== (task.originUnitRevision === null) ||
        (task.state === "DONE" &&
          (task.completedAt === null ||
            task.completionVersion === null ||
            task.completionVersion <= 1 ||
            task.completionVersion > task.version)) ||
        (task.state !== "DONE" &&
          (task.completedAt !== null || task.completionVersion !== null))
      )
        throw new TransferManifestError("INVALID_BUNDLE");
    }
    for (const event of manifest.events) {
      if (
        !validText(event.title, 300) ||
        event.description.includes("\u0000") ||
        !validCalendarTimeZone(event.timeZone) ||
        (event.startDate !== null && !validCalendarDate(event.startDate)) ||
        (event.endDateExclusive !== null &&
          !validCalendarDate(event.endDateExclusive)) ||
        (event.startLocal !== null && event.startLocal.includes("\u0000")) ||
        (event.endLocal !== null && event.endLocal.includes("\u0000")) ||
        (event.scheduleKind === "TIMED" &&
          (event.startAt === null ||
            event.endAt === null ||
            Date.parse(event.startAt) >= Date.parse(event.endAt) ||
            event.startLocal === null ||
            event.endLocal === null ||
            event.startOffsetMinutes === null ||
            event.endOffsetMinutes === null ||
            event.startDate !== null ||
            event.endDateExclusive !== null)) ||
        (event.scheduleKind === "ALL_DAY" &&
          (event.startDate === null ||
            event.endDateExclusive === null ||
            event.startDate >= event.endDateExclusive ||
            event.startAt !== null ||
            event.endAt !== null ||
            event.startLocal !== null ||
            event.endLocal !== null ||
            event.startOffsetMinutes !== null ||
            event.endOffsetMinutes !== null))
      )
        throw new TransferManifestError("INVALID_BUNDLE");
      if (event.scheduleKind === "TIMED") {
        try {
          const start = resolveLocalTime(
            event.startLocal!,
            event.timeZone,
            event.startOffsetMinutes!,
          );
          const end = resolveLocalTime(
            event.endLocal!,
            event.timeZone,
            event.endOffsetMinutes!,
          );
          if (start.at !== event.startAt || end.at !== event.endAt)
            throw new Error("time mismatch");
        } catch {
          throw new TransferManifestError("INVALID_BUNDLE");
        }
      }
    }
    if (
      new Set(manifest.tasks.map((task) => task.id.toLowerCase())).size !==
        manifest.tasks.length ||
      new Set(manifest.events.map((event) => event.id.toLowerCase())).size !==
        manifest.events.length
    )
      throw new TransferManifestError("INVALID_BUNDLE");
  }
  if (
    manifest.version === 3 ||
    manifest.version === 4 ||
    manifest.version === 5 ||
    manifest.version === 6
  ) {
    if (
      new Set(manifest.contexts.map((context) => context.id.toLowerCase()))
        .size !== manifest.contexts.length
    )
      throw new TransferManifestError("INVALID_BUNDLE");
    for (const context of manifest.contexts) {
      if (
        !validText(context.name, 200) ||
        !validText(context.purpose, 2000) ||
        !validText(context.scope, 2000) ||
        (context.state !== "SUPERSEDED" && context.supersededById !== null) ||
        context.supersededById?.toLowerCase() === context.id.toLowerCase()
      )
        throw new TransferManifestError("INVALID_BUNDLE");
    }
  }
  if (
    manifest.version === 4 ||
    manifest.version === 5 ||
    manifest.version === 6
  ) {
    const tasks = new Map(
      manifest.tasks.map((task) => [task.id.toLowerCase(), task]),
    );
    const byTask = new Map<string, typeof manifest.taskTransitions>();
    for (const transition of manifest.taskTransitions) {
      const task = tasks.get(transition.taskId.toLowerCase());
      if (
        !task ||
        transition.version > task.version ||
        !taskTransitionAllowed(transition.fromState, transition.toState)
      )
        throw new TransferManifestError("INVALID_BUNDLE");
      const taskId = transition.taskId.toLowerCase();
      const history = byTask.get(taskId) ?? [];
      history.push(transition);
      byTask.set(taskId, history);
    }
    for (const [taskId, history] of byTask) {
      history.sort((a, b) => a.version - b.version);
      for (let index = 0; index < history.length; index++) {
        if (
          (index > 0 &&
            (history[index]!.version === history[index - 1]!.version ||
              history[index]!.fromState !== history[index - 1]!.toState)) ||
          (index === history.length - 1 &&
            history[index]!.toState !== tasks.get(taskId)!.state)
        )
          throw new TransferManifestError("INVALID_BUNDLE");
      }
      const task = tasks.get(taskId)!;
      if (
        task.state === "DONE" &&
        history[history.length - 1]!.version !== task.completionVersion
      )
        throw new TransferManifestError("INVALID_BUNDLE");
    }
  }
  if (manifest.version === 5 || manifest.version === 6) {
    const tasks = new Map(
      manifest.tasks.map((task) => [task.id.toLowerCase(), task]),
    );
    const captures = new Set(
      manifest.captures.map((capture) => capture.id.toLowerCase()),
    );
    const ids = new Set<string>();
    const completions = new Set<string>();
    const usedCaptures = new Set<string>();
    for (const result of manifest.taskResults) {
      const task = tasks.get(result.taskId.toLowerCase());
      const completion = `${result.taskId.toLowerCase()}:${result.completionVersion}`;
      const captureId = result.captureId.toLowerCase();
      if (
        ids.has(result.id.toLowerCase()) ||
        completions.has(completion) ||
        usedCaptures.has(captureId) ||
        !task ||
        !captures.has(captureId) ||
        result.completionVersion > task.version ||
        !manifest.taskTransitions.some(
          (transition) =>
            transition.taskId.toLowerCase() === result.taskId.toLowerCase() &&
            transition.version === result.completionVersion &&
            transition.toState === "DONE",
        )
      )
        throw new TransferManifestError("INVALID_BUNDLE");
      ids.add(result.id.toLowerCase());
      completions.add(completion);
      usedCaptures.add(captureId);
    }
  }
  const expectedPaths = new Set(["manifest.json"]);
  const ids = new Set<string>();
  const captures = manifest.captures.map((record) => {
    if (
      ids.has(record.id.toLowerCase()) ||
      record.path !== `captures/${record.id}.md` ||
      expectedPaths.has(record.path)
    )
      throw new TransferManifestError("INVALID_BUNDLE");
    ids.add(record.id.toLowerCase());
    expectedPaths.add(record.path);
    const bytes = files.get(record.path);
    if (!bytes || bytes.length < 1 || bytes.length > 200_000)
      throw new TransferManifestError("INVALID_BUNDLE");
    if (transferHash(bytes) !== record.sha256)
      throw new TransferManifestError("INVALID_BUNDLE");
    const rawBody = bytes.toString("utf8");
    if (!Buffer.from(rawBody, "utf8").equals(bytes))
      throw new TransferManifestError("INVALID_BUNDLE");
    if (!validText(record.title, 300) || !validRawBody(rawBody))
      throw new TransferManifestError("INVALID_BUNDLE");
    return { ...record, rawBody };
  });
  const captureRevisions: (Omit<
    TransferManifestV6["captureRevisions"][number],
    "path" | "sha256"
  > & { rawBody: string })[] = [];
  if (manifest.version === 6) {
    if (manifest.captures.length + manifest.captureRevisions.length > 255)
      throw new TransferManifestError("INVALID_BUNDLE");
    const current = new Map(
      manifest.captures.map((record) => [record.id.toLowerCase(), record]),
    );
    const revisions = new Map<string, Set<number>>();
    for (const record of manifest.captureRevisions) {
      const capture = current.get(record.captureId.toLowerCase());
      const seen =
        revisions.get(record.captureId.toLowerCase()) ?? new Set<number>();
      if (
        !capture ||
        record.revision >= capture.revision ||
        seen.has(record.revision) ||
        record.path !== `captures/${record.captureId}/${record.revision}.md` ||
        expectedPaths.has(record.path)
      )
        throw new TransferManifestError("INVALID_BUNDLE");
      seen.add(record.revision);
      revisions.set(record.captureId.toLowerCase(), seen);
      expectedPaths.add(record.path);
      const bytes = files.get(record.path);
      if (
        !bytes ||
        bytes.length < 1 ||
        bytes.length > 200_000 ||
        transferHash(bytes) !== record.sha256
      )
        throw new TransferManifestError("INVALID_BUNDLE");
      const rawBody = bytes.toString("utf8");
      if (
        !Buffer.from(rawBody, "utf8").equals(bytes) ||
        !validText(record.title, 300) ||
        !validRawBody(rawBody)
      )
        throw new TransferManifestError("INVALID_BUNDLE");
      captureRevisions.push({
        captureId: record.captureId,
        revision: record.revision,
        title: record.title,
        recordedAt: record.recordedAt,
        rawBody,
      });
    }
    for (const capture of manifest.captures) {
      const seen = revisions.get(capture.id.toLowerCase());
      if ((seen?.size ?? 0) !== capture.revision - 1)
        throw new TransferManifestError("INVALID_BUNDLE");
    }
  }
  if (files.size !== expectedPaths.size)
    throw new TransferManifestError("INVALID_BUNDLE");
  return { manifest, captures, captureRevisions };
}

function validTaskTimeZone(value: string): boolean {
  if (value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validCalendarTimeZone(value: string): boolean {
  try {
    timeZoneFormat(value);
    return true;
  } catch {
    return false;
  }
}
