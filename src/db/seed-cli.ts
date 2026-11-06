import { DB_PATH, DATA_DIR } from "../paths.ts";
import { openDb } from "./connection.ts";
import { seed } from "./seed.ts";

const db = openDb(DB_PATH);
seed(db, DATA_DIR);
const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
console.log(
  `Seeded ${DB_PATH}: ${count("users")} users, ${count("circles")} circles, ` +
    `${count("memberships")} memberships, ${count("posts")} posts`,
);
db.close();
