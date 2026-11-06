// Prints recommendations for the planted scenarios: npm run demo [userId...]
import { buildApp } from "../src/app.ts";
import { openDb } from "../src/db/connection.ts";
import { seed } from "../src/db/seed.ts";
import { DATA_DIR } from "../src/paths.ts";

const SCENARIOS: Record<number, string> = {
  42: "Cold start",
  7: "Obvious matches",
  15: "Duplicate Circles",
  23: "Full / inactive Circles",
};

const db = openDb(":memory:");
seed(db, DATA_DIR);
const app = buildApp({ db });

const args = process.argv.slice(2).map(Number);
const ids = args.length > 0 ? args : Object.keys(SCENARIOS).map(Number);

for (const id of ids) {
  const res = await app.inject({ url: `/users/${id}/recommendations?debug=true` });
  const body = res.json();
  if (res.statusCode !== 200) {
    console.log(`\nuser ${id}: ${body.message}`);
    continue;
  }
  console.log(`\n=== User ${id}${SCENARIOS[id] ? `: ${SCENARIOS[id]}` : ""} (based on: ${body.personalization}) ===`);
  for (const r of body.recommendations) {
    console.log(`\n${r.rank}. #${r.circle.id} ${r.circle.name}  [score ${r.debug.score}]`);
    console.log(`   ${r.explanation}`);
    if (r.similar_circles.length > 0) {
      console.log(`   Similar: ${r.similar_circles.map((c: { name: string }) => c.name).join(", ")}`);
    }
  }
  const skipped = body.excluded.filter((e: { reason: string }) => e.reason !== "already_member");
  console.log(`\n   Filtered out: ${skipped.map((e: { name: string; reason: string }) => `${e.name} (${e.reason})`).join(", ")}`);
}
await app.close();
