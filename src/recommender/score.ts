import {
  ACTIVITY_SATURATION, ACTIVITY_WEIGHTS, DORMANT_AFTER_DAYS, EXTRA_INTEREST_BONUS, FIT_WEIGHTS,
  IDEAL_SIZE, MIN_CHAT_WITHOUT_POSTS, QUALITY_WEIGHTS, RECENCY_HALF_LIFE_DAYS, REDUNDANT_TOPIC_PENALTY,
  RELEVANCE,
} from "./config.ts";
import { BROAD_TOPICS, relatedTopics, REQUIRES_EXPLICIT_INTEREST, topicsFromBio } from "./topics.ts";
import type { Circle, ExclusionReason, Match, Member, Scored } from "./types.ts";

const DAY_MS = 86_400_000;

/**
 * `last_activity_at` can be older than the newest post in the feed, so we use
 * whichever is later rather than call a Circle quieter than it really is.
 */
export function daysSinceActivity(circle: Circle, asOf: Date): number {
  const last = Math.max(
    Date.parse(circle.lastActivityAt),
    circle.newestPostAt ? Date.parse(circle.newestPostAt) : 0,
  );
  return Math.max(0, (asOf.getTime() - last) / DAY_MS);
}

export function spotsLeft(circle: Circle): number | null {
  return circle.maxMembers === null ? null : Math.max(0, circle.maxMembers - circle.memberCount);
}

export function isInactive(circle: Circle, asOf: Date): boolean {
  const noRecentActivity = daysSinceActivity(circle, asOf) > DORMANT_AFTER_DAYS;
  const barelyAnyChat = circle.feedPosts30d === 0 && circle.chatMessages30d < MIN_CHAT_WITHOUT_POSTS;
  return noRecentActivity || barelyAnyChat;
}

/** Hard rules: a Circle that fails any of these can't rank, however good the topic match. */
export function exclusionReason(circle: Circle, member: Member, asOf: Date): ExclusionReason | null {
  if (member.joinedCircles.some((c) => c.id === circle.id)) return "already_member";
  if (spotsLeft(circle) === 0) return "full";
  if (isInactive(circle, asOf)) return "inactive";
  if (circle.access !== "public") return "unlisted";
  return null;
}

const saturating = (value: number, saturation: number): number =>
  Math.min(1, Math.log1p(value) / Math.log1p(saturation));

/** 0–1: is there something happening here for a new member to join in on? */
export function activityScore(circle: Circle, asOf: Date): number {
  const w = ACTIVITY_WEIGHTS;
  return (
    w.posts * saturating(circle.feedPosts30d, ACTIVITY_SATURATION.posts) +
    w.recency * 0.5 ** (daysSinceActivity(circle, asOf) / RECENCY_HALF_LIFE_DAYS) +
    w.chat * saturating(circle.chatMessages30d, ACTIVITY_SATURATION.chat) +
    w.engagement * saturating(circle.engagementPerPost30d, ACTIVITY_SATURATION.engagementPerPost)
  );
}

/** 0–1: how easily can this member actually take part? */
export function fitScore(circle: Circle, member: Member): number {
  const join = circle.joinPolicy === "open" ? 1 : 0.6;
  // Circles have no location field, so we can't tell if an in-person Circle is
  // reachable. That's a mild penalty, or a heavy one for a member who says they're remote.
  const inPerson = member.location === "Remote" ? 0.1 : 0.5;
  const format = circle.format === "in_person" ? inPerson : 1;
  const inIdealRange = circle.memberCount >= IDEAL_SIZE.min && circle.memberCount <= IDEAL_SIZE.max;
  const size = inIdealRange ? 1 : 0.6;
  return FIT_WEIGHTS.join * join + FIT_WEIGHTS.format * format + FIT_WEIGHTS.size * size;
}

/** The strongest reason this Circle is relevant, or null if we have no honest one. */
export function findMatch(circle: Circle, member: Member): { match: Match; relevance: number } | null {
  // Without a topic we'd have nothing true to tell the member. We also won't guess
  // from a name that a regional or identity Circle (#27, #28) suits someone.
  const { topic } = circle;
  if (topic === null) return null;

  const stated = new Set(member.interests);
  const taggedInterests = circle.tags.filter((tag) => stated.has(tag) && tag !== topic);

  if (stated.has(topic)) {
    return {
      match: { kind: "stated_topic", topic, alsoCovers: taggedInterests },
      relevance: RELEVANCE.statedTopic + EXTRA_INTEREST_BONUS * taggedInterests.length,
    };
  }
  const phrase = topicsFromBio(member.bio).get(topic);
  if (phrase !== undefined) {
    return { match: { kind: "bio", topic, phrase }, relevance: RELEVANCE.bio };
  }
  if (REQUIRES_EXPLICIT_INTEREST.has(topic)) return null;

  const related = relatedTopics(topic);
  const source = member.interests.find((interest) => related.has(interest));
  if (source !== undefined) {
    return { match: { kind: "related_to_stated", topic, source }, relevance: RELEVANCE.relatedToStated };
  }
  const sourceCircle = member.joinedCircles.find(
    (c) => !c.dormant && c.topic !== null && related.has(c.topic),
  );
  if (sourceCircle !== undefined) {
    return {
      match: { kind: "related_to_circle", topic, sourceCircle: sourceCircle.name },
      relevance: RELEVANCE.relatedToCircle,
    };
  }
  if (taggedInterests.length > 0) {
    return {
      match: { kind: "stated_tag", topic, interests: taggedInterests },
      relevance: RELEVANCE.statedTag + EXTRA_INTEREST_BONUS * (taggedInterests.length - 1),
    };
  }
  if (BROAD_TOPICS.has(topic)) return { match: { kind: "discovery", topic }, relevance: RELEVANCE.discovery };
  return null;
}

/**
 * score = relevance × quality, where quality runs from 0.4 to 1.
 *
 * Multiplying (not adding) makes relevance a tier: a Circle on a stated interest
 * beats a merely related one, because activity can't turn an off-topic Circle into
 * a good recommendation. Quality orders Circles within a tier. The one exception is
 * the redundancy penalty, which can drop a topic the member already has a Circle for.
 */
export function scoreCircle(circle: Circle, member: Member, asOf: Date): Scored | null {
  const found = findMatch(circle, member);
  if (found === null) return null;
  const activity = activityScore(circle, asOf);
  const fit = fitScore(circle, member);
  const quality = QUALITY_WEIGHTS.floor + QUALITY_WEIGHTS.activity * activity + QUALITY_WEIGHTS.fit * fit;
  const alreadyCovered = member.joinedCircles.some((c) => !c.dormant && c.topic === circle.topic);
  const redundancyPenalty = alreadyCovered ? REDUNDANT_TOPIC_PENALTY : 1;
  return {
    circle,
    match: found.match,
    score: found.relevance * quality * redundancyPenalty,
    breakdown: { relevance: found.relevance, activity, fit, redundancyPenalty },
  };
}
