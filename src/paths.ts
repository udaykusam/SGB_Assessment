import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

export const DATA_DIR = join(ROOT, "data");
export const DB_PATH = process.env.DB_PATH ?? join(ROOT, "circles.db");
