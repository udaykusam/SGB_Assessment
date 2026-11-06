import { existsSync } from "node:fs";
import { buildApp } from "./app.ts";
import { openDb } from "./db/connection.ts";
import { seed } from "./db/seed.ts";
import { DATA_DIR, DB_PATH } from "./paths.ts";

const isNewDatabase = !existsSync(DB_PATH);
const db = openDb(DB_PATH);
if (isNewDatabase) seed(db, DATA_DIR);

const asOf = process.env.AS_OF ? new Date(process.env.AS_OF) : undefined;
const app = buildApp({ db, asOf, logger: true });

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "127.0.0.1" });
