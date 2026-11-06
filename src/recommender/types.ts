export type CircleFormat = "in_person" | "virtual" | "hybrid";

export interface Circle {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  topic: string | null;
  topicLabel: string | null;
  tags: string[];
  coverImageUrl: string | null;
  format: CircleFormat;
  access: "public" | "unlisted";
  joinPolicy: "open" | "request";
  maxMembers: number | null;
  memberCount: number;
  lastActivityAt: string;
  feedPosts30d: number;
  chatMessages30d: number;
  newestPostAt: string | null;
  engagementPerPost30d: number;
}

export interface JoinedCircle {
  id: number;
  name: string;
  topic: string | null;
  /** A dormant Circle says little about what the member wants now. */
  dormant?: boolean;
}

export interface Member {
  id: number;
  bio: string | null;
  location: string | null;
  interests: string[];
  joinedCircles: JoinedCircle[];
}

export type ExclusionReason = "already_member" | "unlisted" | "full" | "inactive";

/** Why a Circle is relevant to this member, from strongest evidence to weakest. */
export type Match =
  | { kind: "stated_topic"; topic: string; alsoCovers: string[] }
  | { kind: "bio"; topic: string; phrase: string }
  | { kind: "related_to_stated"; topic: string; source: string }
  | { kind: "related_to_circle"; topic: string; sourceCircle: string }
  | { kind: "stated_tag"; topic: string; interests: string[] }
  | { kind: "discovery"; topic: string };

export interface Scored {
  circle: Circle;
  match: Match;
  score: number;
  breakdown: { relevance: number; activity: number; fit: number; redundancyPenalty: number };
}

export type PersonalizationBasis = "interests" | "profile" | "memberships" | "cold_start";

export interface Recommendation extends Scored {
  rank: number;
  explanation: string;
  similarCircles: { id: number; name: string }[];
}

export interface RecommendationResult {
  basis: PersonalizationBasis;
  recommendations: Recommendation[];
  excluded: { circleId: number; name: string; reason: ExclusionReason }[];
}
