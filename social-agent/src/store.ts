import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Platform } from "./platforms.ts";

export interface Brand {
  name: string;
  voice: string;
  audience: string;
  goal: string;
}

export interface Config {
  /** IANA zone where most of the audience lives, e.g. "Africa/Lagos". */
  timeZone: string;
  brand: Brand;
  /** Postiz integration id per platform; platforms left out are skipped. */
  integrations: Partial<Record<Platform, string>>;
  /** Provider settings merged over each platform's defaults. */
  settings: Partial<Record<Platform, Record<string, unknown>>>;
  scheduling: { minLeadMinutes: number; horizonDays: number; minGapHours: number };
}

export interface PlannedPost {
  platform: Platform;
  text: string;
  hashtags: string[];
  caption: string;
  hookRationale: string;
  at: string;
  /** Slot score relative to an average hour (1.0). */
  score: number;
}

export interface Plan {
  id: string;
  createdAt: string;
  brief: string;
  media: string[];
  posts: PlannedPost[];
  skipped: { platform: Platform; reason: string }[];
}

export interface HistoryEntry {
  planId: string;
  platform: Platform;
  integrationId: string;
  postizId: string | null;
  postedAt: string;
  status: "draft" | "scheduled";
  engagement: number | null;
  measuredAt: string | null;
}

export const CONFIG_PATH = process.env.SOCIAL_AGENT_CONFIG ?? "social-agent.config.json";
export const HISTORY_PATH = "data/history.json";
export const PLANS_DIR = "plans";

export async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if (fallback !== undefined && (err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export async function loadConfig(): Promise<Config> {
  try {
    return await readJson<Config>(CONFIG_PATH);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No ${CONFIG_PATH}. Copy social-agent.config.example.json to it and fill it in.`);
    }
    throw err;
  }
}

export const loadHistory = () => readJson<HistoryEntry[]>(HISTORY_PATH, []);
export const saveHistory = (h: HistoryEntry[]) => writeJson(HISTORY_PATH, h);
