// Hand-written editorial knowledge about the 22-topic taxonomy.

/**
 * Topics that commonly go together, used to fill out a list once direct matches
 * run out. Lookups are symmetric (see relatedTopics).
 */
const RELATED: Record<string, string[]> = {
  "leadership-skills": ["managing-a-team", "communication", "confidence", "visibility-recognition"],
  "managing-a-team": ["giving-feedback", "difficult-conversations"],
  "giving-feedback": ["communication", "difficult-conversations"],
  "negotiation": ["confidence", "getting-promoted", "difficult-conversations"],
  "getting-promoted": ["visibility-recognition", "managing-up", "sponsorship-mentorship"],
  "managing-up": ["communication", "visibility-recognition"],
  "visibility-recognition": ["public-speaking", "networking"],
  "networking": ["sponsorship-mentorship"],
  "confidence": ["imposter-syndrome", "public-speaking"],
  "imposter-syndrome": ["being-the-only-one"],
  "stress-burnout": ["resilience", "work-life-integration"],
  "resilience": ["career-breaks"],
  "communication": ["public-speaking", "difficult-conversations"],
  "gender-bias": ["allyship", "being-the-only-one"],
  "working-motherhood": ["work-life-integration", "career-breaks"],
};

const relatedIndex = new Map<string, Set<string>>();
for (const [topic, others] of Object.entries(RELATED)) {
  for (const other of others) {
    (relatedIndex.get(topic) ?? relatedIndex.set(topic, new Set()).get(topic)!).add(other);
    (relatedIndex.get(other) ?? relatedIndex.set(other, new Set()).get(other)!).add(topic);
  }
}

export function relatedTopics(topic: string): ReadonlySet<string> {
  return relatedIndex.get(topic) ?? new Set();
}

/**
 * Topics safe to suggest to someone we know nothing about. This leaves out
 * life-stage and identity topics such as working motherhood, career breaks and
 * being the only one: a member can choose those, but we shouldn't assume them.
 */
export const BROAD_TOPICS: ReadonlySet<string> = new Set([
  "leadership-skills",
  "confidence",
  "networking",
  "communication",
  "sponsorship-mentorship",
  "visibility-recognition",
  "getting-promoted",
  "negotiation",
  "managing-up",
]);

/**
 * Life-stage and identity topics. These need the member's own word for it (a stated
 * interest or their bio). A stray tag or a related topic must never put Working
 * Mothers United in front of someone who only asked about getting promoted.
 */
export const REQUIRES_EXPLICIT_INTEREST: ReadonlySet<string> = new Set([
  "working-motherhood",
  "career-breaks",
  "being-the-only-one",
]);

/**
 * Plain phrases in a bio that point to a topic. Deliberately literal and short:
 * we can quote the phrase back to the member, so the reason is checkable.
 */
const BIO_PHRASES: { pattern: RegExp; phrase: string; topic: string }[] = [
  { pattern: /career break/i, phrase: "a career break", topic: "career-breaks" },
  { pattern: /first-time manager/i, phrase: "being a first-time manager", topic: "managing-a-team" },
  { pattern: /mentoring/i, phrase: "mentoring", topic: "sponsorship-mentorship" },
  { pattern: /leadership/i, phrase: "leadership", topic: "leadership-skills" },
  { pattern: /pay equity/i, phrase: "pay equity", topic: "negotiation" },
  { pattern: /comp conversation/i, phrase: "a comp conversation", topic: "negotiation" },
  { pattern: /promotion/i, phrase: "promotion paths", topic: "getting-promoted" },
  { pattern: /next level/i, phrase: "reaching the next level", topic: "getting-promoted" },
  { pattern: /confidence/i, phrase: "building confidence", topic: "confidence" },
  { pattern: /executive presence/i, phrase: "executive presence", topic: "visibility-recognition" },
];

export function topicsFromBio(bio: string | null): Map<string, string> {
  const found = new Map<string, string>();
  if (!bio) return found;
  for (const { pattern, phrase, topic } of BIO_PHRASES) {
    if (pattern.test(bio) && !found.has(topic)) found.set(topic, phrase);
  }
  return found;
}
