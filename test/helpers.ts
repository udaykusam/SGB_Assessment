import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../src/app.ts";
import { seed } from "../src/db/seed.ts";
import { DATA_DIR } from "../src/paths.ts";

export function seededDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  seed(db, DATA_DIR);
  return db;
}

export const testApp = () => buildApp({ db: seededDb() });

export interface Item {
  rank: number;
  circle: { id: number; name: string; topic: string | null; spots_left: number | null };
  explanation: string;
  reason: string;
  similar_circles: { id: number; name: string }[];
  debug?: { score: number };
}
export interface Body {
  user_id: number;
  as_of: string;
  personalization: string;
  prompt: string | null;
  recommendations: Item[];
  excluded?: { circleId: number; reason: string }[];
}
