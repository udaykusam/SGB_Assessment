// Every tunable in the ranker, in one place. Values are hand-set: there is no
// engagement or join data to learn from yet. docs/DESIGN.md explains the choices.

/** A Circle is dormant if nothing at all has happened for this long. */
export const DORMANT_AFTER_DAYS = 60;
/** With no posts in 30 days, a little chat doesn't make a Circle active. */
export const MIN_CHAT_WITHOUT_POSTS = 5;

/** Relevance sets the tier. See the note on `score` in score.ts. */
export const RELEVANCE = {
  statedTopic: 1.0,
  bio: 0.55,
  relatedToStated: 0.45,
  relatedToCircle: 0.4,
  statedTag: 0.35, // Tags are noisy: below any topic-level evidence.
  discovery: 0.2,
} as const;
/** Added for each further stated interest a Circle covers in its tags. */
export const EXTRA_INTEREST_BONUS = 0.1;
/** Applied when the member is already in a Circle on the same topic. */
export const REDUNDANT_TOPIC_PENALTY = 0.8;

export const QUALITY_WEIGHTS = { floor: 0.4, activity: 0.4, fit: 0.2 } as const;

export const ACTIVITY_WEIGHTS = { posts: 0.35, recency: 0.3, chat: 0.2, engagement: 0.15 } as const;
/** Values at which each activity signal saturates, so size alone can't dominate. */
export const ACTIVITY_SATURATION = { posts: 20, chat: 200, engagementPerPost: 20 } as const;
export const RECENCY_HALF_LIFE_DAYS = 14;

export const FIT_WEIGHTS = { join: 0.4, format: 0.4, size: 0.2 } as const;
/** Circles are small peer groups, so very large ones are a slightly worse fit. */
export const IDEAL_SIZE = { min: 5, max: 20 } as const;

export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 20;
export const MAX_SIMILAR_CIRCLES = 2;
export const FEW_SPOTS_LEFT = 2;
