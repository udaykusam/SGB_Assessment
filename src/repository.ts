import type { Db } from "./db/connection.ts";
import type { Circle, JoinedCircle, Member } from "./recommender/types.ts";

interface CircleRow {
  id: number; name: string; slug: string; description: string | null;
  topic: string | null; topic_label: string | null; tags: string | null;
  cover_image_url: string | null; format: Circle["format"]; access: Circle["access"];
  join_policy: Circle["joinPolicy"]; max_members: number | null; member_count: number;
  last_activity_at: string; feed_posts_30d: number; chat_messages_30d: number;
  newest_post_at: string | null; engagement_per_post_30d: number;
}

export function loadCircles(db: Db): Circle[] {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug, c.description, t.slug AS topic, t.label AS topic_label,
           (SELECT json_group_array(ct.tag) FROM circle_tags ct WHERE ct.circle_id = c.id) AS tags,
           c.cover_image_url, c.format, c.access, c.join_policy, c.max_members, c.member_count,
           c.last_activity_at, c.feed_posts_30d, c.chat_messages_30d,
           r.newest_post_at, r.engagement_per_post_30d
    FROM circles c
    LEFT JOIN topics t ON t.id = c.topic_id
    LEFT JOIN circle_activity_rollups r ON r.circle_id = c.id
    ORDER BY c.id
  `).all() as unknown as CircleRow[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    topic: r.topic,
    topicLabel: r.topic_label,
    tags: JSON.parse(r.tags ?? "[]") as string[],
    coverImageUrl: r.cover_image_url,
    format: r.format,
    access: r.access,
    joinPolicy: r.join_policy,
    maxMembers: r.max_members,
    memberCount: r.member_count,
    lastActivityAt: r.last_activity_at,
    feedPosts30d: r.feed_posts_30d,
    chatMessages30d: r.chat_messages_30d,
    newestPostAt: r.newest_post_at,
    engagementPerPost30d: r.engagement_per_post_30d ?? 0,
  }));
}

export function loadMember(db: Db, userId: number): Member | null {
  const user = db.prepare("SELECT id, bio, location FROM users WHERE id = ?").get(userId) as
    | { id: number; bio: string | null; location: string | null }
    | undefined;
  if (!user) return null;

  const interests = db.prepare(`
    SELECT t.slug FROM user_topic_interests i
    JOIN topics t ON t.id = i.topic_id
    WHERE i.user_id = ?
    ORDER BY t.id
  `).all(userId) as unknown as { slug: string }[];

  const joinedCircles = db.prepare(`
    SELECT c.id, c.name, t.slug AS topic FROM memberships m
    JOIN circles c ON c.id = m.circle_id
    LEFT JOIN topics t ON t.id = c.topic_id
    WHERE m.user_id = ?
    ORDER BY m.joined_at DESC, c.id
  `).all(userId) as unknown as JoinedCircle[];

  return {
    id: user.id,
    bio: user.bio,
    location: user.location,
    interests: interests.map((i) => i.slug),
    joinedCircles: joinedCircles.map((c) => ({ id: c.id, name: c.name, topic: c.topic })),
  };
}

export function loadTopicLabels(db: Db): Map<string, string> {
  const rows = db.prepare("SELECT slug, label FROM topics").all() as unknown as { slug: string; label: string }[];
  return new Map(rows.map((t) => [t.slug, t.label]));
}

export function loadDatasetAsOf(db: Db): Date {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'dataset_as_of'").get() as { value: string };
  return new Date(row.value);
}
