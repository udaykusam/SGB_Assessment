// The scenarios Lean In planted in the dataset, plus invariants across every member.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { type Body, seededDb, testApp } from "./helpers.ts";

let app: FastifyInstance;
before(() => { app = testApp(); });
after(() => app.close());

async function recsFor(userId: number, query = ""): Promise<Body> {
  const res = await app.inject({ url: `/users/${userId}/recommendations${query}` });
  assert.equal(res.statusCode, 200);
  return res.json();
}
const ids = (body: Body) => body.recommendations.map((r) => r.circle.id);

describe("cold start (user 42)", () => {
  it("returns a full list that doesn't pretend to know the member", async () => {
    const body = await recsFor(42);
    assert.equal(body.personalization, "cold_start");
    assert.equal(body.recommendations.length, 5);
    assert.ok(body.prompt, "should invite the member to pick topics");
    for (const r of body.recommendations) {
      assert.doesNotMatch(r.explanation, /you said|your bio|since you're in/i);
    }
  });

  it("doesn't assume identity or life stage, or show topicless Circles", async () => {
    const body = await recsFor(42, "?limit=20");
    const assumed = new Set(["working-motherhood", "career-breaks", "being-the-only-one", null]);
    for (const r of body.recommendations) assert.ok(!assumed.has(r.circle.topic), r.circle.name);
  });

  it("shows topic variety", async () => {
    const topics = (await recsFor(42)).recommendations.map((r) => r.circle.topic);
    assert.equal(new Set(topics).size, topics.length);
  });
});

describe("obvious matches (user 7)", () => {
  it("puts #5 Women Who Lead and #6 Speak Up Circle first", async () => {
    assert.deepEqual(ids(await recsFor(7)).slice(0, 2).sort(), [5, 6]);
  });

  it("explains each by the interest the member stated", async () => {
    const body = await recsFor(7);
    const byId = new Map(body.recommendations.map((r) => [r.circle.id, r]));
    assert.match(byId.get(5)!.explanation, /leadership skills/);
    assert.match(byId.get(6)!.explanation, /public speaking/);
  });
});

describe("duplicate Circles (user 15)", () => {
  it("shows only one of the three negotiation Circles", async () => {
    const shown = ids(await recsFor(15, "?limit=20")).filter((id) => [10, 11, 12].includes(id));
    assert.equal(shown.length, 1);
  });

  it("still ranks negotiation near the top and offers the others as alternatives", async () => {
    const body = await recsFor(15);
    const negotiation = body.recommendations.find((r) => r.circle.topic === "negotiation")!;
    assert.ok(negotiation.rank <= 2);
    assert.equal(negotiation.similar_circles.length, 2);
  });
});

describe("full and inactive Circles (user 23)", () => {
  it("ranks #22 Level Up Collective first", async () => {
    assert.equal(ids(await recsFor(23))[0], 22);
  });

  it("never shows #20 (full) or #21 (inactive), even as an alternative", async () => {
    const body = await recsFor(23, "?limit=20");
    const everyId = body.recommendations.flatMap((r) => [r.circle.id, ...r.similar_circles.map((s) => s.id)]);
    assert.ok(!everyId.includes(20));
    assert.ok(!everyId.includes(21));
  });

  it("reports why they were filtered in debug mode", async () => {
    const body = await recsFor(23, "?debug=true");
    const reason = (id: number) => body.excluded!.find((e) => e.circleId === id)?.reason;
    assert.equal(reason(20), "full");
    assert.equal(reason(21), "inactive");
  });

  it("doesn't suggest a parenting Circle because of a stray tag", async () => {
    const shown = ids(await recsFor(23, "?limit=20"));
    assert.ok(!shown.includes(19), "#19 Working Mothers United is only tagged getting-promoted");
  });
});

describe("dormant memberships (user 18)", () => {
  it("doesn't name the dormant Resilience Room as a reason", async () => {
    for (const r of (await recsFor(18)).recommendations) {
      assert.doesNotMatch(r.explanation, /Resilience Room/);
    }
  });
});

describe("every member in the dataset", () => {
  const db = seededDb();
  const userIds = (db.prepare("SELECT id FROM users").all() as { id: number }[]).map((u) => u.id);
  const circleFacts = new Map(
    (db.prepare("SELECT id, access, member_count, max_members FROM circles").all() as {
      id: number; access: string; member_count: number; max_members: number | null;
    }[]).map((c) => [c.id, c]),
  );

  it("covers 100 members", () => assert.equal(userIds.length, 100));

  it("gets a full, valid, explained list", async () => {
    for (const id of userIds) {
      const body = await recsFor(id);
      const where = `user ${id}`;
      assert.equal(body.recommendations.length, 5, where);

      const joined = new Set(
        (db.prepare("SELECT circle_id FROM memberships WHERE user_id = ?").all(id) as { circle_id: number }[])
          .map((m) => m.circle_id),
      );
      const topics = body.recommendations.map((r) => r.circle.topic);
      assert.equal(new Set(topics).size, topics.length, `${where}: repeated topic`);

      for (const r of body.recommendations) {
        const c = circleFacts.get(r.circle.id)!;
        assert.ok(!joined.has(c.id), `${where}: already in #${c.id}`);
        assert.equal(c.access, "public", `${where}: unlisted #${c.id}`);
        assert.ok(c.max_members === null || c.member_count < c.max_members, `${where}: full #${c.id}`);
        assert.ok(r.explanation.length > 40 && r.explanation.length < 320, `${where}: ${r.explanation}`);
        assert.doesNotMatch(r.explanation, /undefined|null|NaN/, where);
      }
    }
  });

  it("ranks a stated-interest Circle first whenever one is eligible", async () => {
    for (const id of userIds) {
      const body = await recsFor(id, "?limit=20");
      const reasons = body.recommendations.map((r) => r.reason);
      const lastStated = reasons.lastIndexOf("stated_topic");
      if (lastStated >= 0) {
        assert.ok(reasons.slice(0, lastStated + 1).every((x) => x === "stated_topic"), `user ${id}: ${reasons}`);
      }
    }
  });
});
