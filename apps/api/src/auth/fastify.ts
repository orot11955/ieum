import type { FastifyInstance } from "fastify";
import type { AuthPort } from "@ieum/backend/identity";
import { getSessionCookie } from "better-auth/cookies";
import type { IeumAuth } from "./auth.js";
import { sessionWithinBudget } from "./session-policy.js";

export function createAuthPort(auth: IeumAuth): AuthPort {
  return {
    async resolveSession(cookieHeader) {
      if (!cookieHeader) return null;
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader }),
      });
      if (!session) return null;
      if (!sessionWithinBudget(session.session)) return null;
      return {
        userId: session.user.id,
        sessionId: session.session.id,
        email: session.user.email,
        authenticatedAt: session.session.createdAt,
      };
    },
  };
}

export function registerAuthRoutes(
  fastify: FastifyInstance,
  auth: IeumAuth,
  baseUrl: string,
  loginAllowed?: (email: string) => Promise<boolean>,
  withAuthMutationLock?: <T>(operation: () => Promise<T>) => Promise<T>,
): void {
  const origin = new URL(baseUrl).origin;
  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const expected = new URL(origin);
      if (
        request.headers.host !== expected.host ||
        (request.headers["x-forwarded-host"] &&
          request.headers["x-forwarded-host"] !== expected.host) ||
        (request.headers["x-forwarded-proto"] &&
          request.headers["x-forwarded-proto"] !==
            expected.protocol.slice(0, -1))
      ) {
        return reply.code(400).send({ code: "INVALID_HOST" });
      }
      if (request.method !== "GET" && request.headers.origin !== origin) {
        return reply.code(403).send({ code: "INVALID_ORIGIN" });
      }
      const url = new URL(request.raw.url ?? request.url, origin);
      if (url.origin !== origin || !url.pathname.startsWith("/api/auth/")) {
        return reply.code(400).send({ code: "INVALID_URL" });
      }
      const serve = async () => {
        if (
          loginAllowed &&
          request.method === "POST" &&
          url.pathname === "/api/auth/sign-in/email" &&
          typeof request.body === "object" &&
          request.body !== null &&
          "email" in request.body &&
          typeof request.body.email === "string" &&
          !(await loginAllowed(request.body.email))
        ) {
          return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
        }
        if (
          getSessionCookie(
            new Headers({ cookie: request.headers.cookie ?? "" }),
          ) &&
          ![
            "/api/auth/sign-in/email",
            "/api/auth/sign-out",
            "/api/auth/forget-password",
            "/api/auth/reset-password",
          ].includes(url.pathname) &&
          !(await createAuthPort(auth).resolveSession(request.headers.cookie))
        ) {
          if (url.pathname === "/api/auth/get-session") {
            return reply.header("cache-control", "no-store").send(null);
          }
          return reply.code(401).send({ code: "SESSION_EXPIRED" });
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (
            ![
              "connection",
              "content-length",
              "forwarded",
              "transfer-encoding",
              "x-forwarded-for",
              "x-forwarded-host",
              "x-forwarded-proto",
              "x-ieum-client-ip",
            ].includes(key) &&
            value !== undefined
          ) {
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
        }
        headers.set("x-ieum-client-ip", request.ip);
        // Fastify has already parsed JSON; send its value once to the Fetch handler.
        const body =
          request.body === undefined ? undefined : JSON.stringify(request.body);
        const response = await auth.handler(
          new Request(url, {
            method: request.method,
            headers,
            ...(body === undefined ? {} : { body }),
          }),
        );
        for (const [key, value] of response.headers) {
          if (key !== "set-cookie" && key !== "content-length")
            reply.header(key, value);
        }
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) reply.header("set-cookie", cookies);
        return reply
          .code(response.status)
          .send(Buffer.from(await response.arrayBuffer()));
      };
      return request.method === "GET" || !withAuthMutationLock
        ? serve()
        : withAuthMutationLock(serve);
    },
  });
}
