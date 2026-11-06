-- Rationale for these tables and indexes: docs/SCHEMA.md

CREATE TABLE topics (
  id     INTEGER PRIMARY KEY,
  slug   TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL,
  domain TEXT NOT NULL
);

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  has_photo            INTEGER NOT NULL CHECK (has_photo IN (0, 1)),
  bio                  TEXT,
  job_title            TEXT,
  company              TEXT,
  industry             TEXT,
  location             TEXT,
  joined_at            TEXT NOT NULL,
  profile_completeness REAL NOT NULL CHECK (profile_completeness BETWEEN 0 AND 1)
);

-- A member's stated interests. Empty for members who skipped the picker.
CREATE TABLE user_topic_interests (
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics (id),
  PRIMARY KEY (user_id, topic_id)
) WITHOUT ROWID;

CREATE TABLE circles (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  description       TEXT,
  topic_id          INTEGER REFERENCES topics (id),  -- NULL: some Circles have no topic
  cover_image_url   TEXT,
  format            TEXT NOT NULL CHECK (format IN ('in_person', 'virtual', 'hybrid')),
  access            TEXT NOT NULL CHECK (access IN ('public', 'unlisted')),
  join_policy       TEXT NOT NULL CHECK (join_policy IN ('open', 'request')),
  max_members       INTEGER CHECK (max_members IS NULL OR max_members > 0),  -- NULL: uncapped
  member_count      INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  created_at        TEXT NOT NULL,
  last_activity_at  TEXT NOT NULL,
  feed_posts_30d    INTEGER NOT NULL DEFAULT 0,
  chat_messages_30d INTEGER NOT NULL DEFAULT 0
);

-- Candidate lookup: "listed Circles on these topics". Partial, so unlisted
-- Circles can't be reached through the index the recommender reads.
CREATE INDEX circles_listed_by_topic ON circles (topic_id) WHERE access = 'public';

-- Tags are free-form in the source, so they stay text instead of a topics FK.
CREATE TABLE circle_tags (
  circle_id INTEGER NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (circle_id, tag)
) WITHOUT ROWID;

CREATE INDEX circle_tags_by_tag ON circle_tags (tag, circle_id);

CREATE TABLE memberships (
  user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  circle_id INTEGER NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('member', 'leader')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (user_id, circle_id)  -- also serves "which Circles is this member in?"
) WITHOUT ROWID;

-- Reverse direction: a Circle's roster, and its leaders.
CREATE INDEX memberships_by_circle ON memberships (circle_id, role);

CREATE TABLE posts (
  id              INTEGER PRIMARY KEY,
  circle_id       INTEGER NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  author_user_id  INTEGER NOT NULL REFERENCES users (id),
  body            TEXT NOT NULL,
  reaction_count  INTEGER NOT NULL DEFAULT 0,
  comment_count   INTEGER NOT NULL DEFAULT 0,
  save_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

-- Used by the rollup below, and by a Circle's feed in a real product.
CREATE INDEX posts_by_circle_recent ON posts (circle_id, created_at DESC);

-- Rollup of posts, so a recommendation request never scans the posts table.
-- Rebuilt at seed time here; a scheduled job would refresh it in production.
CREATE TABLE circle_activity_rollups (
  circle_id               INTEGER PRIMARY KEY REFERENCES circles (id) ON DELETE CASCADE,
  newest_post_at          TEXT,
  engagement_per_post_30d REAL NOT NULL DEFAULT 0,
  computed_as_of          TEXT NOT NULL
);

-- Holds the snapshot time of the dataset (see "as_of" in docs/DESIGN.md).
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
