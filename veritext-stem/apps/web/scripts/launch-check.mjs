// Asks a deployed site what is still missing before it can take payments.
//   VERITEXT_ADMIN_TOKEN=... node scripts/launch-check.mjs https://your-site
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.VERITEXT_ADMIN_TOKEN ?? "";
const res = await fetch(`${base}/api/admin/stats`, { headers: { authorization: `Bearer ${token}` } });
if (res.status === 401) {
  console.error("Not authorised: set VERITEXT_ADMIN_TOKEN here to the same value as on the server.");
  process.exit(2);
}
const stats = await res.json();
const problems = stats.launch_problems ?? [];
if (problems.length) {
  console.error(`Not ready (${problems.length}):`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log(`Ready. Usage store: ${stats.store}; model: ${stats.model}.`);
console.log(
  `This month: ${stats.runs} runs, ${stats.words} words, model cost $${stats.model_cost_usd} ($${stats.cost_per_1k_words_usd}/1k words).`,
);
