import { DEFAULT_LIMIT, MAX_SIMILAR_CIRCLES } from "./config.ts";
import { explain } from "./explain.ts";
import { exclusionReason, isInactive, scoreCircle } from "./score.ts";
import { topicsFromBio } from "./topics.ts";
import type {
  Circle, Member, PersonalizationBasis, Recommendation, RecommendationResult, Scored,
} from "./types.ts";

export interface RecommendInput {
  member: Member;
  circles: Circle[];
  topicLabels: ReadonlyMap<string, string>;
  asOf: Date;
  limit?: number;
}

function personalizationBasis(member: Member): PersonalizationBasis {
  if (member.interests.length > 0) return "interests";
  if (topicsFromBio(member.bio).size > 0) return "profile";
  if (member.joinedCircles.length > 0) return "memberships";
  return "cold_start";
}

/**
 * Keeps the best Circle per topic and tucks the rest behind it. Descriptions and
 * names can't separate duplicates in this data (descriptions are templated from the
 * topic), so the topic is the duplicate key. Ids break ties so results are stable.
 */
function collapseByTopic(ranked: Scored[]): { top: Scored; similar: Scored[] }[] {
  const groups = new Map<string, { top: Scored; similar: Scored[] }>();
  for (const scored of ranked) {
    const key = scored.circle.topic ?? `circle:${scored.circle.id}`;
    const group = groups.get(key);
    if (group) group.similar.push(scored);
    else groups.set(key, { top: scored, similar: [] });
  }
  return [...groups.values()];
}

/** The ranking pipeline: filter, score, collapse duplicates, explain. Pure, with no I/O. */
export function recommend(input: RecommendInput): RecommendationResult {
  const { circles, topicLabels, asOf, limit = DEFAULT_LIMIT } = input;
  const dormantIds = new Set(circles.filter((c) => isInactive(c, asOf)).map((c) => c.id));
  const member: Member = {
    ...input.member,
    joinedCircles: input.member.joinedCircles.map((c) => ({ ...c, dormant: dormantIds.has(c.id) })),
  };
  const basis = personalizationBasis(member);
  const labelOf = (slug: string) => topicLabels.get(slug) ?? slug;

  const excluded: RecommendationResult["excluded"] = [];
  const scored: Scored[] = [];
  for (const circle of circles) {
    const reason = exclusionReason(circle, member, asOf);
    if (reason !== null) {
      excluded.push({ circleId: circle.id, name: circle.name, reason });
      continue;
    }
    const result = scoreCircle(circle, member, asOf);
    if (result !== null) scored.push(result);
  }
  scored.sort((a, b) => b.score - a.score || a.circle.id - b.circle.id);

  const recommendations: Recommendation[] = collapseByTopic(scored)
    .slice(0, limit)
    .map(({ top, similar }, index) => ({
      ...top,
      rank: index + 1,
      explanation: explain(top.circle, top.match, basis, asOf, labelOf),
      similarCircles: similar
        .slice(0, MAX_SIMILAR_CIRCLES)
        .map(({ circle }: { circle: Circle }) => ({ id: circle.id, name: circle.name })),
    }));

  return { basis, recommendations, excluded };
}
