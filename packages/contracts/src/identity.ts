import * as z from "zod";

export const IdentityPaths = {
  me: "/api/v1/me",
  activity: "/api/v1/me/activity",
  sessions: "/api/v1/me/sessions",
  session: "/api/v1/me/sessions/{sessionId}",
  preferences: "/api/v1/me/preferences",
  invitations: "/api/v1/ops/invitations",
  acceptInvitation: "/api/v1/invitations/accept",
  userState: "/api/v1/ops/users/{userId}/state",
} as const;

export const MeResponseSchema = z.strictObject({
  user: z.strictObject({ id: z.string(), email: z.email() }),
  workspace: z.strictObject({ id: z.uuid(), role: z.literal("OWNER") }),
  operator: z.boolean(),
  preferences: z.strictObject({
    timeZone: z.string(),
    externalModelEnabled: z.literal(false),
    version: z.int().positive(),
  }),
});

export const SessionListResponseSchema = z.strictObject({
  sessions: z.array(
    z.strictObject({
      id: z.string(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      userAgent: z.string().nullable(),
      ipAddress: z.string().nullable(),
      current: z.boolean(),
    }),
  ),
});

export const PreferenceRequestSchema = z.strictObject({
  timeZone: z.string().min(1).max(100),
  baseVersion: z.int().positive(),
});
export const PreferenceResponseSchema = z.strictObject({
  timeZone: z.string(),
  externalModelEnabled: z.literal(false),
  version: z.int().positive(),
  commandId: z.uuid(),
  replayed: z.boolean(),
});

export const InvitationIssueRequestSchema = z.strictObject({
  email: z.email(),
});
export const InvitationIssueResponseSchema = z.strictObject({
  token: z.string().min(43),
  expiresAt: z.iso.datetime({ offset: true }),
});
export const InvitationAcceptRequestSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  name: z.string().min(1).max(200),
  password: z.string().min(15).max(1024),
});
export const InvitationAcceptResponseSchema = z.strictObject({
  workspaceId: z.uuid(),
});
export const UserStateRequestSchema = z.strictObject({
  suspended: z.boolean(),
});

function json(schema: z.ZodType): object {
  return z.toJSONSchema(schema, { target: "openapi-3.0" });
}

function request(schema: z.ZodType): object {
  return {
    required: true,
    content: { "application/json": { schema: json(schema) } },
  };
}

function response(schema: z.ZodType, description: string): object {
  return {
    description,
    content: { "application/json": { schema: json(schema) } },
  };
}

export const identityOpenApiPaths = {
  [IdentityPaths.me]: {
    get: {
      operationId: "getMe",
      responses: { "200": response(MeResponseSchema, "Current account") },
    },
  },
  [IdentityPaths.activity]: {
    post: {
      operationId: "recordMyActivity",
      responses: { "204": { description: "User activity recorded" } },
    },
  },
  [IdentityPaths.sessions]: {
    get: {
      operationId: "listMySessions",
      responses: {
        "200": response(SessionListResponseSchema, "Current account sessions"),
      },
    },
  },
  [IdentityPaths.session]: {
    delete: {
      operationId: "revokeMySession",
      parameters: [
        {
          name: "sessionId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: { "204": { description: "Session revoked" } },
    },
  },
  [IdentityPaths.preferences]: {
    patch: {
      operationId: "updateMyPreferences",
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 8, maxLength: 128 },
        },
      ],
      requestBody: request(PreferenceRequestSchema),
      responses: {
        "200": response(PreferenceResponseSchema, "Updated preferences"),
      },
    },
  },
  [IdentityPaths.invitations]: {
    post: {
      operationId: "issueInvitation",
      requestBody: request(InvitationIssueRequestSchema),
      responses: {
        "201": response(
          InvitationIssueResponseSchema,
          "One-time invitation token",
        ),
      },
    },
  },
  [IdentityPaths.acceptInvitation]: {
    post: {
      operationId: "acceptInvitation",
      requestBody: request(InvitationAcceptRequestSchema),
      responses: {
        "201": response(
          InvitationAcceptResponseSchema,
          "Personal workspace created",
        ),
      },
    },
  },
  [IdentityPaths.userState]: {
    patch: {
      operationId: "setUserState",
      parameters: [
        {
          name: "userId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: request(UserStateRequestSchema),
      responses: { "204": { description: "Account state changed" } },
    },
  },
} as const;
