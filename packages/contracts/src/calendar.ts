import * as z from "zod";

const id = z.uuid(),
  version = z.int().positive();
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
const date = z.iso.date();
const zone = z.string().min(1).max(100);
export const EventStateSchema = z.enum(["CONFIRMED", "CANCELED"]);
export const EventScheduleInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("TIMED"),
    timeZone: zone,
    startLocal: local,
    endLocal: local,
    startOffsetMinutes: z.int().min(-1440).max(1440).optional(),
    endOffsetMinutes: z.int().min(-1440).max(1440).optional(),
  }),
  z.strictObject({
    kind: z.literal("ALL_DAY"),
    timeZone: zone,
    startDate: date,
    endDateExclusive: date,
  }),
]);
export const CreateEventRequestSchema = z.strictObject({
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  schedule: EventScheduleInputSchema,
});
export const EditEventRequestSchema = z
  .strictObject({
    baseVersion: version,
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(10000).optional(),
    schedule: EventScheduleInputSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.title === undefined &&
      data.description === undefined &&
      data.schedule === undefined
    )
      ctx.addIssue({
        code: "custom",
        message: "At least one change is required",
      });
  });
export const SetEventStateRequestSchema = z.strictObject({
  baseVersion: version,
  targetState: EventStateSchema,
});
const command = z.strictObject({ commandId: id, replayed: z.boolean() });
export const EventCommandResponseSchema = command.extend({
  id,
  version,
  state: EventStateSchema,
});
export const EventScheduleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("TIMED"),
    timeZone: zone,
    startLocal: local,
    endLocal: local,
    startOffsetMinutes: z.int(),
    endOffsetMinutes: z.int(),
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    displayStartLocal: local.optional(),
    displayEndLocal: local.optional(),
  }),
  z.strictObject({
    kind: z.literal("ALL_DAY"),
    timeZone: zone,
    startDate: date,
    endDateExclusive: date,
  }),
]);
export const EventSummarySchema = z.strictObject({
  id,
  title: z.string(),
  description: z.string(),
  state: EventStateSchema,
  version,
  schedule: EventScheduleSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const EventDetailSchema = EventSummarySchema.extend({ workspaceId: id });
export const EventPeriodSchema = z.strictObject({
  fromDate: date,
  toDateExclusive: date,
  viewTimeZone: zone,
  events: z.array(
    EventSummarySchema.extend({ overlappingEventIds: z.array(id) }),
  ),
});

const base = "/api/v1/workspaces/{wid}/events";
const wid = {
  name: "wid",
  in: "path",
  required: true,
  schema: { type: "string" },
};
const eid = {
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
export const calendarOpenApiPaths = {
  [base]: {
    get: {
      operationId: "listEvents",
      parameters: [
        wid,
        {
          name: "fromDate",
          in: "query",
          required: true,
          schema: { type: "string", format: "date" },
        },
        {
          name: "toDateExclusive",
          in: "query",
          required: true,
          schema: { type: "string", format: "date" },
        },
        {
          name: "viewTimeZone",
          in: "query",
          required: true,
          schema: { type: "string" },
        },
        { name: "includeCanceled", in: "query", schema: { type: "boolean" } },
      ],
      responses: {
        "200": response(EventPeriodSchema, "Events in the requested period"),
      },
    },
    post: {
      operationId: "createEvent",
      parameters: [wid, key],
      requestBody: body(CreateEventRequestSchema),
      responses: {
        "201": response(EventCommandResponseSchema, "Event created"),
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      operationId: "getEvent",
      parameters: [wid, eid],
      responses: { "200": response(EventDetailSchema, "Event detail") },
    },
  },
  [`${base}/{id}/edit`]: {
    post: {
      operationId: "editEvent",
      parameters: [wid, eid, key],
      requestBody: body(EditEventRequestSchema),
      responses: {
        "201": response(EventCommandResponseSchema, "Event edited"),
      },
    },
  },
  [`${base}/{id}/state`]: {
    post: {
      operationId: "setEventState",
      parameters: [wid, eid, key],
      requestBody: body(SetEventStateRequestSchema),
      responses: {
        "201": response(EventCommandResponseSchema, "Event state changed"),
      },
    },
  },
};
