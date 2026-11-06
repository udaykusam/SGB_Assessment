# Technical Design: Circle Recommendations

## What I built

A TypeScript, Fastify and SQLite API: `GET /users/:id/recommendations`. A Circle only helps a member who can join it and finds people there, so the pipeline is:

1. **Filter.** Remove Circles the member has joined, and ones that are full, dormant or unlisted. A great topic match can't rescue these.
2. **Score: `relevance × quality`.** Multiplying makes relevance a tier: a quiet Circle on a stated interest beats a lively, merely related one. Quality (activity 2 : fit 1) orders Circles within a tier.
3. **Collapse duplicates.** Keep the best Circle per topic; return the rest as `similar_circles`.
4. **Explain.** Templates use the same signals that produced the rank, so every claim is traceable.

## Signals

| Used | Why |
| --- | --- |
| Stated interests (relevance 1.0) | The member told us directly |
| Bio phrases (0.55) | Can be quoted back to the member |
| Related topics (0.45, 0.4) | Hand-written map to fill out the list |
| Tags (0.35) | Noisy here: #1's tags omit its own topic |
| Posts, recency, chat, engagement | "Will anyone answer me?" Log-scaled so size can't dominate |
| Join policy, format, size | Can the member realistically take part? |

**Not used:** company, industry and job title (nothing on a Circle to match them to); photo and profile completeness (they'd penalize newcomers); co-membership (too sparse and random here).

## Decisions worth defending

- **No assumptions about identity or life stage.** Working motherhood, career breaks and being the only one need a stated interest or bio mention. Topicless Circles (#27, #28) aren't recommended, because all we could do is guess from the name.
- **Honest about location.** Circles have no location, so in-person ones say "check the location" and take a small penalty.
- **The clock is the dataset's snapshot.** On today's date, every Circle would look 46 days staler.
- **Recency uses the newer of `last_activity_at` and the newest post,** because they disagree (#29: 16 days vs. today).

## Tradeoffs

- **Hand-set weights:** there are no join outcomes to train on. They're explainable and live in `config.ts`.
- **Templates over an LLM:** no hallucination risk, cost or latency, but more repetitive wording.
- **Topic as the duplicate key:** descriptions are templated, so it also collapses distinct Circles (#35 behind #5). `similar_circles` softens that.
- **SQLite:** zero setup for reviewers; the SQL ports easily to Postgres.

## What the audit showed

All 100 members get five valid results, but two issues remain:

- **Concentration:** five Circles take 40% of slots. The Negotiation Table appears in 45 lists with 10 spots left.
- **Supply gap:** `being-the-only-one` has no listed Circle, leaving 6 stated interests unserved. That's a reason to start a Circle, not a ranking fix.

## Production scale

- **Retrieval:** fetch candidates by topic through the partial index; cache lists and invalidate on join.
- **Freshness:** scheduled activity rollups, with capacity re-checked at join time.
- **Learning:** log impressions, joins and 30-day retention, then A/B test weights. Success means members still active after 30 days, not clicks.
- **Fair distribution:** spread demand by capacity and give new Circles exposure.
- **Better data:** Circle location first, then semantic duplicate detection.

## With more time

Test the explanations with real members, let members dismiss recommendations, and suggest starting a Circle for unserved topics.
