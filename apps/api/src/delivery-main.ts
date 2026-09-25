import "reflect-metadata";
import { Pool } from "pg";
import {
  assertDeliveryDatabaseRole,
  DeliveryReader,
  LocalDeliveryAssetReader,
} from "@ieum/backend/delivery/reader";
import { createDeliveryApp } from "./delivery/app.js";

const databaseUrl = process.env.DELIVERY_DATABASE_URL;
const derivativeRoot = process.env.IEUM_ASSET_DERIVATIVE_ROOT;
const port = Number(process.env.DELIVERY_PORT ?? "3001");
if (!databaseUrl || !derivativeRoot)
  throw new Error(
    "DELIVERY_DATABASE_URL and IEUM_ASSET_DERIVATIVE_ROOT are required",
  );
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("DELIVERY_PORT must be an integer between 1 and 65535");
const pool = new Pool({ connectionString: databaseUrl });
try {
  await assertDeliveryDatabaseRole(pool);
  const assets = await LocalDeliveryAssetReader.create(derivativeRoot);
  const app = await createDeliveryApp(new DeliveryReader(pool, assets), () =>
    pool.end(),
  );
  app.enableShutdownHooks();
  await app.listen(port, process.env.DELIVERY_HOST ?? "127.0.0.1");
} catch (error) {
  await pool.end();
  throw error;
}
