import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recommend } from "../src/recommender/recommend.ts";
import { exclusionReason, findMatch } from "../src/recommender/score.ts";
import type { Circle, Member } from "../src/recommender/types.ts";

const asOf = new Date("2026-09-21T00:00:00Z");

const circle = (over: Partial<Circle> = {}): Circle => ({
  id: 1, name: "Test Circle", slug: "test", description: null,
  topic: "negotiation", topicLabel: "Negotiation", tags: [], coverImageUrl: null,
  format: "virtual", access: "public", joinPolicy: "open", maxMembers: null, memberCount: 10,
  lastActivityAt: "2026-09-20T00:00:00Z", feedPosts30d: 5, chatMessages30d: 20,
  newestPostAt: "2026-09-20T00:00:00Z", engagementPerPost30d: 5,
  ...over,
});
const member = (over: Partial<Member> = {}): Member => ({
  id: 1, bio: null, location: null, interests: [], joinedCircles: [], ...over,
});

describe("exclusionReason", () => {
  it("excludes a Circle at capacity but not an uncapped one", () => {
    assert.equal(exclusionReason(circle({ maxMembers: 10 }), member(), asOf), "full");
    assert.equal(exclusionReason(circle({ maxMembers: 11 }), member(), asOf), null);
    assert.equal(exclusionReason(circle({ maxMembers: null }), member(), asOf), null);
  });

  it("excludes a Circle over capacity", () => {
    assert.equal(exclusionReason(circle({ maxMembers: 9 }), member(), asOf), "full");
  });

  it("excludes dormant and post-less Circles", () => {
    const old = "2026-01-01T00:00:00Z";
    assert.equal(exclusionReason(circle({ lastActivityAt: old, newestPostAt: old }), member(), asOf), "inactive");
    assert.equal(exclusionReason(circle({ feedPosts30d: 0, chatMessages30d: 3 }), member(), asOf), "inactive");
  });

  it("uses the newer of last_activity_at and the newest post", () => {
    const stale = circle({ lastActivityAt: "2026-01-01T00:00:00Z", newestPostAt: "2026-09-20T00:00:00Z" });
    assert.equal(exclusionReason(stale, member(), asOf), null);
  });

  it("excludes unlisted Circles and ones the member already joined", () => {
    assert.equal(exclusionReason(circle({ access: "unlisted" }), member(), asOf), "unlisted");
    const joined = member({ joinedCircles: [{ id: 1, name: "Test Circle", topic: "negotiation" }] });
    assert.equal(exclusionReason(circle(), joined, asOf), "already_member");
  });
});

describe("findMatch", () => {
  it("won't match a Circle with no topic", () => {
    assert.equal(findMatch(circle({ topic: null }), member({ interests: ["negotiation"] })), null);
  });

  it("needs explicit evidence for life-stage topics", () => {
    const parents = circle({ topic: "working-motherhood", tags: ["getting-promoted"] });
    assert.equal(findMatch(parents, member({ interests: ["getting-promoted"] })), null);
    assert.equal(findMatch(parents, member({ interests: ["work-life-integration"] })), null);
    assert.equal(findMatch(parents, member({ interests: ["working-motherhood"] }))?.match.kind, "stated_topic");

    const returners = circle({ topic: "career-breaks" });
    assert.equal(findMatch(returners, member({ bio: "Returning after a career break." }))?.match.kind, "bio");
  });

  it("orders evidence: stated > bio > related > tag > discovery", () => {
    const relevance = (c: Circle, m: Member) => findMatch(c, m)!.relevance;
    const c = circle({ topic: "confidence", tags: ["allyship"] });
    const stated = relevance(c, member({ interests: ["confidence"] }));
    const bio = relevance(c, member({ bio: "Building confidence daily." }));
    const related = relevance(c, member({ interests: ["negotiation"] }));
    const tag = relevance(c, member({ interests: ["allyship"] }));
    const discovery = relevance(c, member());
    assert.ok(stated > bio && bio > related && related > tag && tag > discovery);
  });
});

describe("recommend", () => {
  it("doesn't use a dormant Circle the member joined as a reason", () => {
    const old = "2026-01-01T00:00:00Z";
    const dormant = circle({ id: 1, name: "Sleepy Circle", topic: "resilience", feedPosts30d: 0, chatMessages30d: 0, lastActivityAt: old, newestPostAt: old });
    const burnout = circle({ id: 2, topic: "stress-burnout" });
    const { recommendations } = recommend({
      member: member({ joinedCircles: [{ id: 1, name: "Sleepy Circle", topic: "resilience" }] }),
      circles: [dormant, burnout], topicLabels: new Map(), asOf,
    });
    assert.deepEqual(recommendations, [], "stress-burnout was only related to the dormant Circle");
  });

  it("doesn't penalize a topic the member only has a dormant Circle for", () => {
    const old = "2026-01-01T00:00:00Z";
    const dormant = circle({ id: 1, name: "Sleepy Circle", feedPosts30d: 0, chatMessages30d: 0, lastActivityAt: old, newestPostAt: old });
    const active = circle({ id: 2 });
    const { recommendations } = recommend({
      member: member({ interests: ["negotiation"], joinedCircles: [{ id: 1, name: "Sleepy Circle", topic: "negotiation" }] }),
      circles: [dormant, active], topicLabels: new Map(), asOf,
    });
    assert.equal(recommendations[0]?.breakdown.redundancyPenalty, 1);
  });

  it("lets a stated-interest Circle beat a livelier related one", () => {
    const quiet = circle({ id: 1, topic: "negotiation", feedPosts30d: 1, chatMessages30d: 5, engagementPerPost30d: 0,
      format: "in_person", joinPolicy: "request", lastActivityAt: "2026-08-25T00:00:00Z", newestPostAt: "2026-08-25T00:00:00Z" });
    const lively = circle({ id: 2, topic: "confidence", feedPosts30d: 20, chatMessages30d: 200, engagementPerPost30d: 20 });
    const { recommendations } = recommend({
      member: member({ interests: ["negotiation"] }), circles: [lively, quiet],
      topicLabels: new Map(), asOf,
    });
    assert.deepEqual(recommendations.map((r) => r.circle.id), [1, 2]);
  });

  it("returns fewer than the limit rather than pad with bad Circles", () => {
    const { recommendations } = recommend({
      member: member({ interests: ["negotiation"] }), circles: [circle()],
      topicLabels: new Map(), asOf, limit: 5,
    });
    assert.equal(recommendations.length, 1);
  });
});
