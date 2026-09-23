import type { FastifyInstance } from "fastify";
import type { AuthPort } from "@ieum/backend/identity";
import type { IeumAuth } from "./auth.js";

export function createAuthPort(auth: IeumAuth): AuthPort {
  return {
    async resolveSession(cookieHeader) {
      if (!cookieHeader) return null;
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader }),
      });
      if (!session) return null;
      return {
        userId: session.user.id,
        sessionId: session.session.id,
        email: session.user.email,
      };
    },
  };
}

export function registerAuthRoutes(
  fastify: FastifyInstance,
  auth: IeumAuth,
  baseUrl: string,
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
    },
  });
}
