import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./connection.ts";

const SCHEMA_PATH = join(import.meta.dirname, "schema.sql");
const THIRTY_DAYS_MS = 30 * 86_400_000;

function readJson<T>(dataDir: string, file: string): T[] {
  return JSON.parse(readFileSync(join(dataDir, file), "utf8")) as T[];
}

function dropAllTables(db: Db): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  db.exec("PRAGMA foreign_keys = OFF");
  for (const { name } of tables) db.exec(`DROP TABLE "${name}"`);
  db.exec("PRAGMA foreign_keys = ON");
}

interface RawUser {
  id: number; first_name: string; last_name: string; has_photo: boolean;
  bio: string | null; job_title: string | null; company: string | null;
  industry: string | null; location: string | null; joined_at: string;
  topic_interests: string[]; profile_completeness: number;
}
interface RawCircle {
  id: number; name: string; slug: string; description: string | null;
  topic: string | null; tags: string[]; cover_image_url: string | null;
  format: string; access: string; join_policy: string; max_members: number | null;
  member_count: number; created_at: string; last_activity_at: string;
  feed_posts_30d: number; chat_messages_30d: number;
}
interface RawTopic { id: number; slug: string; label: string; domain: string }
interface RawMembership { user_id: number; circle_id: number; role: string; joined_at: string }
interface RawPost {
  id: number; circle_id: number; author_user_id: number; body: string;
  reaction_count: number; comment_count: number; save_count: number; created_at: string;
}

/** Rebuilds the database from the JSON seed files. Safe to run repeatedly. */
export function seed(db: Db, dataDir: string): void {
  const topics = readJson<RawTopic>(dataDir, "topics.json");
  const users = readJson<RawUser>(dataDir, "users.json");
  const circles = readJson<RawCircle>(dataDir, "circles.json");
  const memberships = readJson<RawMembership>(dataDir, "memberships.json");
  const posts = readJson<RawPost>(dataDir, "activity.json");

  dropAllTables(db);
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));

  const topicIdBySlug = new Map(topics.map((t) => [t.slug, t.id]));
  const topicId = (slug: string): number => {
    const id = topicIdBySlug.get(slug);
    if (id === undefined) throw new Error(`Unknown topic slug in seed data: ${slug}`);
    return id;
  };

  db.exec("BEGIN");
  try {
    const insertTopic = db.prepare("INSERT INTO topics VALUES (?, ?, ?, ?)");
    for (const t of topics) insertTopic.run(t.id, t.slug, t.label, t.domain);

    const insertUser = db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertInterest = db.prepare("INSERT INTO user_topic_interests VALUES (?, ?)");
    for (const u of users) {
      insertUser.run(
        u.id, u.first_name, u.last_name, u.has_photo ? 1 : 0, u.bio, u.job_title,
        u.company, u.industry, u.location, u.joined_at, u.profile_completeness,
      );
      for (const slug of u.topic_interests) insertInterest.run(u.id, topicId(slug));
    }

    const insertCircle = db.prepare(
      "INSERT INTO circles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    // The source repeats some tags on a Circle (e.g. #17); the primary key collapses them.
    const insertTag = db.prepare("INSERT OR IGNORE INTO circle_tags VALUES (?, ?)");
    for (const c of circles) {
      insertCircle.run(
        c.id, c.name, c.slug, c.description, c.topic === null ? null : topicId(c.topic),
        c.cover_image_url, c.format, c.access, c.join_policy, c.max_members, c.member_count,
        c.created_at, c.last_activity_at, c.feed_posts_30d, c.chat_messages_30d,
      );
      for (const tag of c.tags) insertTag.run(c.id, tag);
    }

    const insertMembership = db.prepare("INSERT INTO memberships VALUES (?, ?, ?, ?)");
    for (const m of memberships) insertMembership.run(m.user_id, m.circle_id, m.role, m.joined_at);

    const insertPost = db.prepare("INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const p of posts) {
      insertPost.run(
        p.id, p.circle_id, p.author_user_id, p.body,
        p.reaction_count, p.comment_count, p.save_count, p.created_at,
      );
    }

    // The dataset is a frozen snapshot, so "now" is its newest timestamp.
    const newest = Math.max(
      ...posts.map((p) => Date.parse(p.created_at)),
      ...circles.map((c) => Date.parse(c.last_activity_at)),
      ...memberships.map((m) => Date.parse(m.joined_at)),
    );
    const asOf = new Date(newest).toISOString();
    db.prepare("INSERT INTO app_meta VALUES ('dataset_as_of', ?)").run(asOf);

    db.prepare(`
      INSERT INTO circle_activity_rollups (circle_id, newest_post_at, engagement_per_post_30d, computed_as_of)
      SELECT c.id,
             (SELECT MAX(p.created_at) FROM posts p WHERE p.circle_id = c.id),
             COALESCE((SELECT AVG(p.reaction_count + p.comment_count + p.save_count)
                       FROM posts p
                       WHERE p.circle_id = c.id AND p.created_at >= ?), 0),
             ?
      FROM circles c
    `).run(new Date(newest - THIRTY_DAYS_MS).toISOString(), asOf);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
