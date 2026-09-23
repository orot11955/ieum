import fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { IeumAuth } from "../src/auth/auth.js";
import { registerAuthRoutes } from "../src/auth/fastify.js";

describe("BE-02 Fastify Fetch bridge", () => {
  it("preserves separate Set-Cookie headers and passes a parsed JSON body once", async () => {
    const app = fastify();
    let receivedBody: unknown;
    const auth = {
      handler: async (request: Request) => {
        receivedBody = await request.json();
        expect(request.headers.has("content-length")).toBe(false);
        const headers = new Headers();
        headers.append("set-cookie", "first=1; Path=/; HttpOnly");
        headers.append("set-cookie", "second=2; Path=/; HttpOnly");
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers,
        });
      },
    } as unknown as IeumAuth;
    registerAuthRoutes(app, auth, "http://127.0.0.1:3000");
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/probe",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        payload: '{ "value" : "once" }',
      });
      expect(response.statusCode).toBe(200);
      expect(receivedBody).toEqual({ value: "once" });
      expect(response.headers["set-cookie"]).toEqual([
        "first=1; Path=/; HttpOnly",
        "second=2; Path=/; HttpOnly",
      ]);
    } finally {
      await app.close();
    }
  });
});
