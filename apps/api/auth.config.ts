import { createAuth } from "./src/auth/auth.js";

const databaseUrl = process.env.AUTH_DATABASE_URL;
const baseUrl = process.env.AUTH_BASE_URL;
const secret = process.env.AUTH_SECRET;
if (!databaseUrl || !baseUrl || !secret) {
  throw new Error(
    "AUTH_DATABASE_URL, AUTH_BASE_URL and AUTH_SECRET are required",
  );
}

export const { auth } = createAuth({ databaseUrl, baseUrl, secret });
