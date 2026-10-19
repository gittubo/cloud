import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Thin wrapper over the Postiz CLI (npm i -g postiz). Postiz holds the OAuth
 * connections to every network, uploads media to URLs the platforms accept, and
 * publishes at the scheduled time, so this agent needs no per-platform API apps.
 */

const run = promisify(execFile);
const BIN = process.env.POSTIZ_BIN ?? "postiz";

async function postiz(args: string[]): Promise<unknown> {
  const { stdout } = await run(BIN, args, { maxBuffer: 32 * 1024 * 1024 });
  return parseCliJson(stdout);
}

/** The CLI may print a status line before its JSON; parse from the first JSON token. */
export function parseCliJson(stdout: string): unknown {
  const start = stdout.search(/^[[{]/m);
  if (start === -1) throw new Error(`Postiz returned no JSON:\n${stdout.slice(0, 500)}`);
  return JSON.parse(stdout.slice(start));
}

export interface Integration {
  id: string;
  identifier: string;
  name: string;
}

export async function listIntegrations(): Promise<Integration[]> {
  const out = (await postiz(["integrations:list"])) as Integration[];
  return out.map(({ id, identifier, name }) => ({ id, identifier, name }));
}

export async function integrationSettings(id: string): Promise<unknown> {
  return postiz(["integrations:settings", id]);
}

export async function upload(file: string): Promise<string> {
  const out = (await postiz(["upload", file])) as { path?: string };
  if (!out.path) throw new Error(`Upload of ${file} returned no path`);
  return out.path;
}

export interface CreatePost {
  integrationId: string;
  content: string;
  at: Date;
  mediaUrls: string[];
  settings: Record<string, unknown>;
  draft: boolean;
}

export function createArgs(p: CreatePost): string[] {
  const args = ["posts:create", "-c", p.content, "-s", p.at.toISOString(), "-i", p.integrationId];
  if (p.mediaUrls.length) args.push("-m", p.mediaUrls.join(","));
  if (Object.keys(p.settings).length) args.push("--settings", JSON.stringify(p.settings));
  if (p.draft) args.push("-t", "draft");
  return args;
}

/** Creates the post and returns its Postiz id when the CLI reports one. */
export async function createPost(p: CreatePost): Promise<string | null> {
  return findId(await postiz(createArgs(p)));
}

export function findId(value: unknown): string | null {
  if (Array.isArray(value)) return value.length ? findId(value[0]) : null;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["postId", "id"]) if (typeof o[key] === "string") return o[key] as string;
    for (const key of ["posts", "data", "output"]) if (key in o) return findId(o[key]);
  }
  return null;
}

export async function postAnalytics(postId: string, days: number): Promise<unknown> {
  return postiz(["analytics:post", postId, "-d", String(days)]);
}

const INTERACTION = /like|comment|share|save|repost|retweet|reply|replies|reaction|quote|bookmark/i;

/**
 * Total interactions from an analytics:post response, or null when the
 * platform has not linked the post yet (`{"missing": true}`) or reports none.
 * Daily points that never decrease are read as cumulative, otherwise summed.
 */
export function engagementFrom(analytics: unknown): number | null {
  if (!Array.isArray(analytics)) return null;
  let total = 0;
  let found = false;
  for (const metric of analytics as { label?: string; data?: { total?: number | string }[] }[]) {
    if (!metric.label || !INTERACTION.test(metric.label) || !Array.isArray(metric.data)) continue;
    const points = metric.data.map((d) => Number(d.total)).filter(Number.isFinite);
    if (!points.length) continue;
    const cumulative = points.every((v, i) => i === 0 || v >= points[i - 1]);
    total += cumulative ? points[points.length - 1] : points.reduce((a, b) => a + b, 0);
    found = true;
  }
  return found ? total : null;
}
