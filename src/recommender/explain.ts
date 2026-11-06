import { FEW_SPOTS_LEFT } from "./config.ts";
import { daysSinceActivity, spotsLeft } from "./score.ts";
import type { Circle, Match, PersonalizationBasis } from "./types.ts";

type LabelOf = (slug: string) => string;

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function whyForYou(match: Match, basis: PersonalizationBasis, labelOf: LabelOf): string {
  const label = labelOf(match.topic).toLowerCase();
  switch (match.kind) {
    case "stated_topic": {
      const also = match.alsoCovers.map((t) => labelOf(t).toLowerCase());
      return also.length > 0
        ? `You said you're interested in ${label}, and that's this Circle's focus. It also covers ${list(also)}, another of your interests.`
        : `You said you're interested in ${label}, and that's this Circle's focus.`;
    }
    case "bio":
      return `Your bio mentions ${match.phrase}, and this Circle focuses on ${label}.`;
    case "related_to_stated":
      return `You're interested in ${labelOf(match.source).toLowerCase()}, and this Circle's focus on ${label} often goes hand in hand with it.`;
    case "related_to_circle":
      return `Since you're in ${match.sourceCircle}, you might also like this Circle's focus on ${label}.`;
    case "stated_tag":
      return `This Circle focuses on ${label} and also touches on ${list(match.interests.map((t) => labelOf(t).toLowerCase()))}, which you said you're interested in.`;
    case "discovery":
      return basis === "cold_start"
        ? `A good first Circle if you'd like to explore ${label}.`
        : `Outside your usual topics, but a good way to explore ${label}.`;
  }
}

function whenLastActive(days: number): string {
  const whole = Math.floor(days);
  if (whole === 0) return "today";
  if (whole === 1) return "yesterday";
  return `${whole} days ago`;
}

function howActive(circle: Circle, asOf: Date): string {
  const when = whenLastActive(daysSinceActivity(circle, asOf));
  const posts = circle.feedPosts30d;
  return posts > 0
    ? `Members shared ${posts} ${posts === 1 ? "post" : "posts"} in the last 30 days, most recently ${when}.`
    : `Members have been chatting in the group, most recently ${when}.`;
}

function logistics(circle: Circle): string {
  const members = `${circle.memberCount} ${circle.memberCount === 1 ? "member" : "members"}`;
  const format = {
    virtual: "meets virtually",
    hybrid: "meets online and in person",
    in_person: "meets in person (check the location)",
  }[circle.format];
  const join = circle.joinPolicy === "open" ? "is open to join" : "takes requests to join";
  const spots = spotsLeft(circle);
  const scarcity =
    spots !== null && spots <= FEW_SPOTS_LEFT ? ` Only ${spots} ${spots === 1 ? "spot" : "spots"} left.` : "";
  return `It has ${members}, ${format}, and ${join}.${scarcity}`;
}

/**
 * Built only from the data behind the ranking, so every claim can be traced to
 * a real signal and nothing is invented. See docs/DESIGN.md on templates vs an LLM.
 */
export function explain(
  circle: Circle, match: Match, basis: PersonalizationBasis, asOf: Date, labelOf: LabelOf,
): string {
  return `${whyForYou(match, basis, labelOf)} ${howActive(circle, asOf)} ${logistics(circle)}`;
}
