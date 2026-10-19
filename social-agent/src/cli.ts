import { parseArgs } from "node:util";
import { join } from "node:path";
import { PLATFORMS, RULES, composeCaption, isPlatform, mediaKind, mediaProblem, type Platform } from "./platforms.ts";
import { pickTime, slotScores, topSlots, type Observation } from "./timing.ts";
import { writeVariants } from "./writer.ts";
import * as postiz from "./postiz.ts";
import {
  PLANS_DIR, loadConfig, loadHistory, readJson, saveHistory, writeJson,
  type Config, type HistoryEntry, type Plan, type PlannedPost,
} from "./store.ts";

const USAGE = `social-agent — write once, post natively to Instagram, Facebook, X, LinkedIn and TikTok at the best time

  check                                  Verify Postiz login, list connected accounts and their posting rules
  plan --brief "<text>" [--media a.jpg,b.mp4] [--platforms x,linkedin]
                                         Write a post per platform and pick each one's best time; saves plans/<id>.json
  schedule <plan.json> [--live]          Send a plan to Postiz (as drafts to review, or --live to auto-publish)
  learn [--days 30]                      Pull engagement for published posts so future timing follows your audience
  slots [--platform x] [--top 5]         Show the best hours to post right now`;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function observations(history: HistoryEntry[], platform: Platform): Observation[] {
  return history
    .filter((h) => h.platform === platform && h.engagement !== null)
    .map((h) => ({ postedAt: h.postedAt, engagement: h.engagement! }));
}

function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function list(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function check(config: Config): Promise<void> {
  const integrations = await postiz.listIntegrations();
  console.log("Connected Postiz accounts:");
  for (const i of integrations) console.log(`  ${i.identifier.padEnd(16)} ${i.name.padEnd(24)} ${i.id}`);
  for (const p of PLATFORMS) {
    const id = config.integrations[p];
    if (!id) {
      console.log(`\n${RULES[p].label}: not configured (add its id under "integrations" to post there)`);
      continue;
    }
    if (!integrations.some((i) => i.id === id)) {
      console.log(`\n${RULES[p].label}: id ${id} is not a connected Postiz account`);
      continue;
    }
    // Postiz silently drops settings that do not apply, so show its rules to check against.
    const settings = (await postiz.integrationSettings(id)) as { output?: { rules?: unknown } };
    console.log(`\n${RULES[p].label} (${id}) posting rules:\n${JSON.stringify(settings.output?.rules ?? "none", null, 2)}`);
    console.log(`  settings this agent sends: ${JSON.stringify({ ...RULES[p].defaultSettings, ...config.settings[p] })}`);
  }
}

async function plan(config: Config, brief: string, media: string[], requested: string[]): Promise<void> {
  for (const m of media) if (!mediaKind(m)) throw new Error(`Unsupported media type: ${m}`);
  const unknown = requested.filter((p) => !isPlatform(p));
  if (unknown.length) throw new Error(`Unknown platform(s): ${unknown.join(", ")}. Use: ${PLATFORMS.join(", ")}`);

  const wanted = (requested.length ? requested : PLATFORMS) as Platform[];
  const skipped: Plan["skipped"] = [];
  const targets: Platform[] = [];
  for (const p of wanted) {
    const problem = !config.integrations[p] ? "no Postiz account configured" : mediaProblem(p, media);
    if (problem) skipped.push({ platform: p, reason: problem });
    else targets.push(p);
  }
  if (!targets.length) throw new Error(`Nothing to post:\n${skipped.map((s) => `  ${s.platform}: ${s.reason}`).join("\n")}`);

  console.log(`Writing posts for ${targets.join(", ")}…`);
  const variants = await writeVariants({ brief, platforms: targets, brand: config.brand, media });

  const history = await loadHistory();
  const now = new Date();
  const posts: PlannedPost[] = [];
  for (const v of variants) {
    const taken = history
      .filter((h) => h.platform === v.platform && h.status === "scheduled")
      .map((h) => new Date(h.postedAt));
    const slot = pickTime(slotScores(v.platform, observations(history, v.platform), config.timeZone), {
      now, timeZone: config.timeZone, taken, ...config.scheduling,
    });
    if (!slot) {
      skipped.push({ platform: v.platform, reason: "no free slot in the scheduling horizon" });
      continue;
    }
    posts.push({
      platform: v.platform, text: v.text, hashtags: v.hashtags,
      caption: composeCaption(v.text, v.hashtags), hookRationale: v.hook_rationale,
      at: slot.at.toISOString(), score: Math.round(slot.score * 100) / 100,
    });
  }

  const id = now.toISOString().replace(/[:.]/g, "").slice(0, 17) + "Z";
  const path = join(PLANS_DIR, `${id}.json`);
  await writeJson(path, { id, createdAt: now.toISOString(), brief, media, posts, skipped } satisfies Plan);

  for (const p of posts) {
    console.log(`\n── ${RULES[p.platform].label} · ${localTime(p.at, config.timeZone)} (${config.timeZone}) · slot score ${p.score}×`);
    console.log(p.caption);
    console.log(`   why this hook: ${p.hookRationale}`);
  }
  for (const s of skipped) console.log(`\n── ${RULES[s.platform].label}: skipped (${s.reason})`);
  console.log(`\nSaved ${path}. Edit it if you like, then: npm run agent -- schedule ${path}`);
}

async function schedule(config: Config, planPath: string, live: boolean): Promise<void> {
  const plan = await readJson<Plan>(planPath);
  const history = await loadHistory();
  if (history.some((h) => h.planId === plan.id)) throw new Error(`Plan ${plan.id} was already sent to Postiz`);

  const urls = new Map<string, string>();
  for (const m of plan.media) {
    console.log(`Uploading ${m}…`);
    urls.set(m, await postiz.upload(m));
  }

  for (const p of plan.posts) {
    const integrationId = config.integrations[p.platform];
    if (!integrationId) throw new Error(`No Postiz account configured for ${p.platform}`);
    const accepted = RULES[p.platform].requiresMedia;
    const media = plan.media.filter((m) => !accepted || accepted.includes(mediaKind(m)!));
    const postizId = await postiz.createPost({
      integrationId,
      content: p.caption,
      at: new Date(p.at),
      mediaUrls: media.map((m) => urls.get(m)!),
      settings: { ...RULES[p.platform].defaultSettings, ...config.settings[p.platform] },
      draft: !live,
    });
    history.push({
      planId: plan.id, platform: p.platform, integrationId, postizId, postedAt: p.at,
      status: live ? "scheduled" : "draft", engagement: null, measuredAt: null,
    });
    await saveHistory(history);
    console.log(`${live ? "Scheduled" : "Drafted"} ${RULES[p.platform].label} for ${localTime(p.at, config.timeZone)}${postizId ? "" : " (Postiz returned no post id; learn will skip it)"}`);
  }
  if (!live) {
    console.log("\nThese are drafts: review them in Postiz and schedule them there, or re-run with --live next time.");
    console.log("Drafts you publish from Postiz still count: mark them \"scheduled\" in data/history.json so learn measures them.");
  }
}

async function learn(days: number): Promise<void> {
  const history = await loadHistory();
  const cutoff = Date.now() - 24 * 3_600_000; // give each post a day to collect engagement
  let measured = 0;
  for (const h of history) {
    if (h.status !== "scheduled" || !h.postizId || new Date(h.postedAt).getTime() > cutoff) continue;
    const engagement = postiz.engagementFrom(await postiz.postAnalytics(h.postizId, days));
    if (engagement === null) {
      console.log(`${h.platform} ${h.postizId}: no analytics yet (run "postiz posts:missing ${h.postizId}" if it was published)`);
      continue;
    }
    h.engagement = engagement;
    h.measuredAt = new Date().toISOString();
    measured++;
  }
  await saveHistory(history);
  console.log(`Updated engagement for ${measured} post(s).`);
  for (const p of PLATFORMS) {
    const n = observations(history, p).length;
    if (n) console.log(`  ${RULES[p].label}: timing now uses ${n} of your own post(s)`);
  }
}

async function slots(config: Config, platforms: Platform[], top: number): Promise<void> {
  const history = await loadHistory();
  for (const p of platforms) {
    const obs = observations(history, p);
    const best = topSlots(slotScores(p, obs, config.timeZone), top)
      .map((s) => `${DAYS[s.weekday]} ${String(s.hour).padStart(2, "0")}:00 (${s.score.toFixed(2)}×)`);
    console.log(`${RULES[p].label.padEnd(10)} ${best.join("  ")}   [${obs.length ? `${obs.length} own posts` : "benchmarks only"}]`);
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      brief: { type: "string" }, media: { type: "string" }, platforms: { type: "string" },
      platform: { type: "string" }, live: { type: "boolean" }, days: { type: "string" },
      top: { type: "string" }, help: { type: "boolean", short: "h" },
    },
  });
  const [command, arg] = positionals;
  if (!command || values.help) return console.log(USAGE);

  const config = await loadConfig();
  switch (command) {
    case "check":
      return check(config);
    case "plan":
      if (!values.brief) throw new Error('plan needs --brief "what the post is about"');
      return plan(config, values.brief, list(values.media), list(values.platforms));
    case "schedule":
      if (!arg) throw new Error("schedule needs the path of a plan, e.g. plans/<id>.json");
      return schedule(config, arg, values.live ?? false);
    case "learn":
      return learn(Number(values.days ?? 30));
    case "slots": {
      const only = values.platform;
      if (only && !isPlatform(only)) throw new Error(`Unknown platform: ${only}`);
      return slots(config, only ? [only as Platform] : [...PLATFORMS], Number(values.top ?? 5));
    }
    default:
      throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
