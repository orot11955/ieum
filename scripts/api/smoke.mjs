import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function unusedPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForLive(url, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`API exited before readiness: ${child.exitCode}`);
    try {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
      assert.match(response.headers.get("x-request-id"), /^[\da-f-]{36}$/i);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      return;
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      await delay(50);
    }
  }
  throw new Error("API did not start within 5 seconds");
}

const port = await unusedPort();
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  stdio: "ignore",
});
try {
  await waitForLive(`http://127.0.0.1:${port}/health/live`, child);
  const timeout = new AbortController();
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  let result;
  try {
    result = await Promise.race([
      exit,
      delay(5000, undefined, { signal: timeout.signal }).then(() => {
        throw new Error("API did not stop after SIGTERM");
      }),
    ]);
  } finally {
    timeout.abort();
  }
  assert.ok(
    result[0] === 0 || result[1] === "SIGTERM",
    `Unexpected exit: ${result}`,
  );
  const worker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  worker.stdout.setEncoding("utf8");
  worker.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const [workerCode] = await once(worker, "exit");
  assert.equal(workerCode, 0);
  assert.deepEqual(JSON.parse(output), { status: "ok" });
  process.stdout.write(
    "BE-01 built API startup, HTTP headers, shutdown and worker composition: PASS\n",
  );
} finally {
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}
