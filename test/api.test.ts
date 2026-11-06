import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { seededDb, testApp } from "./helpers.ts";

let app: FastifyInstance;
before(() => { app = testApp(); });
after(() => app.close());

const get = (url: string) => app.inject({ url });

describe("GET /users/:id/recommendations", () => {
  it("returns 404 for an unknown user", async () => {
    const res = await get("/users/9999/recommendations");
    assert.equal(res.statusCode, 404);
    assert.match(res.json().message, /9999/);
  });

  for (const url of [
    "/users/abc/recommendations",
    "/users/0/recommendations",
    "/users/7/recommendations?limit=0",
    "/users/7/recommendations?limit=21",
    "/users/7/recommendations?limit=two",
  ]) {
    it(`returns 400 for ${url}`, async () => assert.equal((await get(url)).statusCode, 400));
  }

  it("honours limit and numbers ranks from 1", async () => {
    const { recommendations } = (await get("/users/7/recommendations?limit=3")).json();
    assert.deepEqual(recommendations.map((r: { rank: number }) => r.rank), [1, 2, 3]);
  });

  it("hides scores and exclusions unless debug is on", async () => {
    const plain = (await get("/users/7/recommendations")).json();
    assert.equal(plain.excluded, undefined);
    assert.equal(plain.recommendations[0].debug, undefined);
    const debug = (await get("/users/7/recommendations?debug=true")).json();
    assert.ok(Array.isArray(debug.excluded));
    assert.equal(typeof debug.recommendations[0].debug.score, "number");
  });

  it("returns the same result every time", async () => {
    const [a, b] = await Promise.all([get("/users/15/recommendations"), get("/users/15/recommendations")]);
    assert.equal(a.body, b.body);
  });

  it("measures activity from the dataset's snapshot, not the wall clock", async () => {
    assert.equal((await get("/users/7/recommendations")).json().as_of, "2026-09-21T00:00:00.000Z");
  });

  it("treats everything as dormant if the clock is far past the snapshot", async () => {
    const late = buildApp({ db: seededDb(), asOf: new Date("2030-01-01T00:00:00Z") });
    const body = (await late.inject({ url: "/users/7/recommendations" })).json();
    assert.deepEqual(body.recommendations, []);
    await late.close();
  });
});

describe("GET /health", () => {
  it("is ok", async () => assert.equal((await get("/health")).statusCode, 200));
});
