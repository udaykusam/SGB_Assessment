import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/connection.ts";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./recommender/config.ts";
import { recommend } from "./recommender/recommend.ts";
import { spotsLeft } from "./recommender/score.ts";
import type { Recommendation } from "./recommender/types.ts";
import { loadCircles, loadDatasetAsOf, loadMember, loadTopicLabels } from "./repository.ts";

export interface AppOptions {
  db: Db;
  /** Overrides the clock. Defaults to the dataset's snapshot time. */
  asOf?: Date;
  logger?: boolean;
}

const PROFILE_PROMPT = "Pick a few topics you care about to get recommendations made for you.";

const round = (n: number) => Math.round(n * 1000) / 1000;

function toResponseItem(rec: Recommendation, debug: boolean) {
  const { circle } = rec;
  return {
    rank: rec.rank,
    circle: {
      id: circle.id,
      name: circle.name,
      slug: circle.slug,
      description: circle.description,
      topic: circle.topic,
      topic_label: circle.topicLabel,
      format: circle.format,
      join_policy: circle.joinPolicy,
      member_count: circle.memberCount,
      spots_left: spotsLeft(circle),
      cover_image_url: circle.coverImageUrl,
    },
    explanation: rec.explanation,
    reason: rec.match.kind,
    similar_circles: rec.similarCircles,
    ...(debug && {
      debug: {
        score: round(rec.score),
        relevance: round(rec.breakdown.relevance),
        activity: round(rec.breakdown.activity),
        fit: round(rec.breakdown.fit),
        redundancy_penalty: rec.breakdown.redundancyPenalty,
      },
    }),
  };
}

export function buildApp({ db, asOf, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const clock = asOf ?? loadDatasetAsOf(db);
  const topicLabels = loadTopicLabels(db);

  app.get("/health", async () => ({ status: "ok" }));

  app.get<{
    Params: { id: number };
    Querystring: { limit: number; debug: boolean };
  }>(
    "/users/:id/recommendations",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer", minimum: 1 } },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
            debug: { type: "boolean", default: false },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { limit, debug } = request.query;

      const member = loadMember(db, id);
      if (member === null) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `No user with id ${id}`,
        });
      }

      const result = recommend({ member, circles: loadCircles(db), topicLabels, asOf: clock, limit });

      return {
        user_id: id,
        as_of: clock.toISOString(),
        personalization: result.basis,
        // Anyone without stated interests can improve their results by adding some.
        prompt: member.interests.length === 0 ? PROFILE_PROMPT : null,
        recommendations: result.recommendations.map((rec) => toResponseItem(rec, debug)),
        ...(debug && { excluded: result.excluded }),
      };
    },
  );

  return app;
}
