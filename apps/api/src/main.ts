import "reflect-metadata";
import { createApiApp } from "./app.js";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const app = await createApiApp();
app.enableShutdownHooks();
await app.listen(port, process.env.HOST ?? "127.0.0.1");
