import * as z from "zod";
const id = z.uuid(),
  version = z.int().positive();
export const TaskStateSchema = z.enum([
  "TODO",
  "IN_PROGRESS",
  "ON_HOLD",
  "DONE",
  "CANCELED",
]);
export const TaskDueSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NONE") }),
  z.strictObject({ kind: z.literal("DATE"), date: z.iso.date() }),
  z.strictObject({
    kind: z.literal("INSTANT"),
    at: z.iso.datetime({ offset: true }),
    timeZone: z.string().min(1).max(100),
  }),
]);
export const CreateTaskRequestSchema = z.strictObject({
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  due: TaskDueSchema.optional(),
  contextId: id.nullable().optional(),
  origin: z.strictObject({ unitId: id, revision: version }).optional(),
});
export const EditTaskRequestSchema = z
  .strictObject({
    baseVersion: version,
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(10000).optional(),
    due: TaskDueSchema.optional(),
    contextId: id.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      [data.title, data.description, data.due, data.contextId].every(
        (v) => v === undefined,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "At least one change is required",
      });
  });
export const TransitionTaskRequestSchema = z.strictObject({
  baseVersion: version,
  targetState: TaskStateSchema,
});
export const AddTaskResultRequestSchema = z.strictObject({
  baseVersion: version,
  title: z.string().min(1).max(300),
  rawBody: z.string().min(1).max(200000),
});
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
export const TaskCommandResponseSchema = command.extend({
  id,
  version,
  state: TaskStateSchema,
});
export const TaskTransitionResponseSchema = TaskCommandResponseSchema.extend({
  completionVersion: version.nullable(),
});
export const TaskResultResponseSchema = command.extend({
  id,
  taskId: id,
  completionVersion: version,
  captureId: id,
  unitId: id,
});
const TaskSummarySchema = z.strictObject({
  id,
  title: z.string(),
  description: z.string(),
  state: TaskStateSchema,
  version,
  due: TaskDueSchema,
  contextId: id.nullable(),
  origin: z.strictObject({
    kind: z.literal("EXPLICIT"),
    unitId: id.nullable(),
    unitRevision: version.nullable(),
  }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  completionVersion: version.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const TaskListSchema = z.strictObject({
  tasks: z.array(TaskSummarySchema),
  nextCursor: z.string().nullable(),
});
export const TaskDetailSchema = TaskSummarySchema.extend({
  workspaceId: id,
  history: z.array(
    z.strictObject({
      version,
      fromState: TaskStateSchema,
      toState: TaskStateSchema,
      recordedAt: z.iso.datetime({ offset: true }),
    }),
  ),
  results: z.array(
    z.strictObject({
      id,
      completionVersion: version,
      captureId: id,
      recordedAt: z.iso.datetime({ offset: true }),
    }),
  ),
});

const base = "/api/v1/workspaces/{wid}/tasks";
const wid = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const tid = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
function body(schema: z.ZodType) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
      },
    },
  };
}
function response(schema: z.ZodType, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: z.toJSONSchema(schema, { target: "openapi-3.0" }),
      },
    },
  };
}
export const taskOpenApiPaths = {
  [base]: {
    get: {
      operationId: "listTasks",
      parameters: [
        wid,
        { name: "state", in: "query", schema: { type: "string" } },
        { name: "cursor", in: "query", schema: { type: "string" } },
      ],
      responses: { "200": response(TaskListSchema, "Scoped tasks") },
    },
    post: {
      operationId: "createTask",
      parameters: [wid, key],
      requestBody: body(CreateTaskRequestSchema),
      responses: { "201": response(TaskCommandResponseSchema, "Task created") },
    },
  },
  [`${base}/{id}`]: {
    get: {
      operationId: "getTask",
      parameters: [wid, tid],
      responses: { "200": response(TaskDetailSchema, "Task detail") },
    },
  },
  [`${base}/{id}/edit`]: {
    post: {
      operationId: "editTask",
      parameters: [wid, tid, key],
      requestBody: body(EditTaskRequestSchema),
      responses: { "201": response(TaskCommandResponseSchema, "Task edited") },
    },
  },
  [`${base}/{id}/transition`]: {
    post: {
      operationId: "transitionTask",
      parameters: [wid, tid, key],
      requestBody: body(TransitionTaskRequestSchema),
      responses: {
        "201": response(TaskTransitionResponseSchema, "Task state changed"),
      },
    },
  },
  [`${base}/{id}/results`]: {
    post: {
      operationId: "addTaskResult",
      parameters: [wid, tid, key],
      requestBody: body(AddTaskResultRequestSchema),
      responses: {
        "201": response(
          TaskResultResponseSchema,
          "Task result recorded as Capture",
        ),
      },
    },
  },
};
