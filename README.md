# Circle Recommendations API

Returns a ranked list of Lean In Circles a member should join, with a short, member-facing explanation for each.

- **[Technical design doc](docs/DESIGN.md):** what was built, the tradeoffs, and what production would need
- **[Database schema](docs/SCHEMA.md):** tables, relationships and indexing decisions
- **[Seed dataset](data/README.md):** the data dictionary and planted scenarios

## Setup

Requires **Node 22.13 or newer** (it uses the built-in `node:sqlite`, so there's no database to install).

```bash
npm install
```

```bash
npm start
```

The server runs on `http://127.0.0.1:3000` and builds `circles.db` from `data/*.json` on first start. Set `PORT` to change the port, or `AS_OF` (an ISO date) to measure activity from a different date than the dataset's snapshot. On Node 22 you'll see a harmless `ExperimentalWarning` for SQLite.

To see the four planted scenarios in a readable form, without starting the server:

```bash
npm run demo
```

## API

### `GET /users/:id/recommendations`

| Query param | Default | Notes |
| --- | --- | --- |
| `limit` | `5` | 1–20. The list can be shorter: bad Circles are never added to fill it. |
| `debug` | `false` | Adds score breakdowns and which Circles were filtered out, and why. |

```bash
curl "http://127.0.0.1:3000/users/23/recommendations?limit=1"
```

```json
{
  "user_id": 23,
  "as_of": "2026-09-21T00:00:00.000Z",
  "personalization": "interests",
  "prompt": null,
  "recommendations": [
    {
      "rank": 1,
      "circle": {
        "id": 22,
        "name": "Level Up Collective",
        "slug": "level-up-collective",
        "description": "A supportive circle for women focused on getting promoted.",
        "topic": "getting-promoted",
        "topic_label": "Getting promoted",
        "format": "hybrid",
        "join_policy": "request",
        "member_count": 14,
        "spots_left": 6,
        "cover_image_url": "https://images.example.org/circles/level-up-collective.jpg"
      },
      "explanation": "You said you're interested in getting promoted, and that's this Circle's focus. Members shared 8 posts in the last 30 days, most recently today. It has 14 members, meets online and in person, and takes requests to join.",
      "reason": "stated_topic",
      "similar_circles": []
    }
  ]
}
```

- `personalization` is what the list is based on: `interests`, `profile` (bio), `memberships` or `cold_start`.
- `prompt` asks members without stated interests to pick some, because that improves their results most.
- `similar_circles` holds near-duplicates collapsed behind this result, for a "more like this" link.
- Errors: `404` for an unknown user, `400` for an invalid id or query param.

`GET /health` returns `{"status":"ok"}`.

## Planted scenarios

| Scenario | Try | Result |
| --- | --- | --- |
| Cold start | `/users/42/recommendations` | Lively, open Circles on five broad career topics, and a prompt to pick interests. No assumptions about identity or life stage. |
| Obvious matches | `/users/7/recommendations` | #6 Speak Up Circle and #5 Women Who Lead take the top two places. |
| Duplicate Circles | `/users/15/recommendations` | Only #11 of the three negotiation Circles is listed. #10 and #12 sit in `similar_circles`. |
| Full / inactive | `/users/23/recommendations?debug=true` | #22 Level Up Collective is first. #20 is filtered as `full` and #21 as `inactive`. |

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

The tests cover the planted scenarios, API validation, the scoring rules, and invariants across all 100 members: everyone gets five valid results, with no joined, full or unlisted Circles and no repeated topics.

## Project layout

```
src/
  app.ts               HTTP routes and response shape
  repository.ts        All SQL reads
  db/                  Schema and JSON seed loader
  recommender/         Pure ranking logic, with no I/O
    recommend.ts       Pipeline: filter → score → collapse duplicates → explain
    score.ts           Eligibility rules, relevance tiers, activity and fit scores
    explain.ts         Member-facing text
    topics.ts          Related topics, broad topics and bio phrases
    config.ts          Every weight and threshold
test/                  Scenario, API and unit tests
scripts/demo.ts        Readable output for the scenarios
```

## How I used AI

I built this with Claude Code. Here's how the work was split:

| Me | Claude Code |
| --- | --- |
| Set the goal and scope from the assignment | Profiled the dataset and flagged data traps |
| Ran the demo and reviewed the recommendations | Proposed the stack and ranking design |
| Decided what to change and what to submit | Wrote the code, tests and first drafts of the docs |
| Take responsibility for the final submission | Audited the results across all 100 members |

Passing tests wasn't enough, so the recommendations were also read the way a member would read them, and that changed the design:

- **Stray tags:** an early version passed all four planted scenarios but recommended Working Mothers United to someone who had only asked about promotion. Tags now rank below topic-level evidence, and life-stage topics need a stated interest or a bio mention.
- **Dormant memberships:** running the demo for other members showed a recommendation justified by a dormant Circle. Dormant Circles no longer count as a reason.

Both fixes are covered by tests.
