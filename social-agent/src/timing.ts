import type { Platform } from "./platforms.ts";

/**
 * Best-time engine. Every hour of the week (in the audience's time zone) gets a
 * score. It starts from published industry benchmarks for each platform and
 * moves towards this account's own results as engagement data comes in.
 */

export const HOURS_PER_WEEK = 168;
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0;
const WEEKDAYS = [MON, TUE, WED, THU, FRI];
const ALL_DAYS = [SUN, MON, TUE, WED, THU, FRI, SAT];

/** [days, fromHour, toHour (exclusive), weight 0..1] in audience-local time. */
type Window = [number[], number, number, number];

// Consensus of the large cross-industry studies (Sprout Social, Hootsuite,
// Later, Buffer). They are a starting point only; `learn` replaces them with
// what actually works for this account.
const BENCHMARKS: Record<Platform, Window[]> = {
  instagram: [
    [ALL_DAYS, 7, 22, 0.35],
    [WEEKDAYS, 9, 14, 0.75],
    [[TUE, WED, THU], 10, 13, 1],
    [WEEKDAYS, 18, 21, 0.7],
  ],
  facebook: [
    [ALL_DAYS, 7, 21, 0.3],
    [WEEKDAYS, 8, 14, 0.75],
    [[TUE, WED, THU], 9, 12, 1],
  ],
  x: [
    [ALL_DAYS, 7, 22, 0.3],
    [WEEKDAYS, 8, 12, 0.85],
    [[TUE, WED, THU], 9, 11, 1],
    [WEEKDAYS, 12, 14, 0.65],
  ],
  linkedin: [
    [WEEKDAYS, 7, 18, 0.45],
    [[TUE, WED, THU], 8, 11, 1],
    [[TUE, WED, THU], 12, 13, 0.8],
    [[SAT, SUN], 9, 12, 0.1],
  ],
  tiktok: [
    [ALL_DAYS, 9, 23, 0.4],
    [ALL_DAYS, 19, 22, 0.8],
    [[TUE, WED, THU, FRI], 14, 18, 0.75],
    [[TUE, THU, FRI], 19, 22, 1],
  ],
};

/** Floor so no hour is impossible, only unlikely. */
const MIN_WEIGHT = 0.05;

/** How many own posts in a slot it takes to outweigh the benchmark equally. */
export const PRIOR_STRENGTH = 3;

export function slotIndex(weekday: number, hour: number): number {
  return weekday * 24 + hour;
}

export function benchmark(platform: Platform): number[] {
  const weights = new Array<number>(HOURS_PER_WEEK).fill(MIN_WEIGHT);
  for (const [days, from, to, weight] of BENCHMARKS[platform]) {
    for (const day of days) {
      for (let h = from; h < to; h++) {
        const i = slotIndex(day, h);
        weights[i] = Math.max(weights[i], weight);
      }
    }
  }
  return weights;
}

const WEEKDAY_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Weekday (0 = Sunday) and hour of an instant, as seen in `timeZone`. */
export function localSlot(date: Date, timeZone: string): { weekday: number; hour: number } {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
    formatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(date);
  const weekday = WEEKDAY_NUM[parts.find((p) => p.type === "weekday")!.value];
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return { weekday, hour };
}

export interface Observation {
  postedAt: string;
  engagement: number;
}

function normalise(weights: number[]): number[] {
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  return weights.map((w) => w / mean);
}

/**
 * Score for every hour of the week, as a multiplier where 1 is an average hour.
 *
 * Each own post is compared with what the benchmark expected of its slot. How
 * far it beat or missed that (on a log scale) adjusts its hour of day and its
 * day of week, shrunk towards "no change" until enough posts agree, so one
 * lucky post cannot move the schedule but a consistent pattern can.
 */
export function slotScores(platform: Platform, observations: Observation[], timeZone: string): number[] {
  const prior = normalise(benchmark(platform));
  const usable = observations.filter((o) => Number.isFinite(o.engagement) && o.engagement >= 0);
  if (!usable.length) return prior;

  const posts = usable.map((o) => {
    const { weekday, hour } = localSlot(new Date(o.postedAt), timeZone);
    return { weekday, hour, engagement: o.engagement, expected: prior[slotIndex(weekday, hour)] };
  });
  const meanEngagement = posts.reduce((a, p) => a + p.engagement, 0) / posts.length;
  const meanExpected = posts.reduce((a, p) => a + p.expected, 0) / posts.length;

  const hourSum = new Array<number>(24).fill(0), hourN = new Array<number>(24).fill(0);
  const daySum = new Array<number>(7).fill(0), dayN = new Array<number>(7).fill(0);
  for (const p of posts) {
    // +1 keeps zero-engagement posts finite on the log scale.
    const actual = (p.engagement + 1) / (meanEngagement + 1);
    const logRatio = Math.log(actual / (p.expected / meanExpected));
    hourSum[p.hour] += logRatio;
    hourN[p.hour] += 1;
    daySum[p.weekday] += logRatio;
    dayN[p.weekday] += 1;
  }
  const shrunk = (sum: number, n: number) => sum / (n + PRIOR_STRENGTH);
  return normalise(
    prior.map((w, i) => {
      const day = Math.floor(i / 24), hour = i % 24;
      return w * Math.exp(shrunk(hourSum[hour], hourN[hour]) + shrunk(daySum[day], dayN[day]));
    }),
  );
}

export interface PickOptions {
  now: Date;
  timeZone: string;
  /** Earliest a post may go out, from now. */
  minLeadMinutes: number;
  horizonDays: number;
  /** Minimum spacing between two posts on the same platform. */
  minGapHours: number;
  /** Times already taken on this platform (scheduled or planned). */
  taken: Date[];
}

/** The best-scoring top-of-the-hour time in the horizon that respects spacing. */
export function pickTime(scores: number[], opts: PickOptions): { at: Date; score: number } | null {
  const earliest = opts.now.getTime() + opts.minLeadMinutes * 60_000;
  const start = new Date(Math.ceil(earliest / 3_600_000) * 3_600_000);
  const gapMs = opts.minGapHours * 3_600_000;
  let best: { at: Date; score: number } | null = null;
  for (let h = 0; h < opts.horizonDays * 24; h++) {
    const at = new Date(start.getTime() + h * 3_600_000);
    if (opts.taken.some((t) => Math.abs(t.getTime() - at.getTime()) < gapMs)) continue;
    const { weekday, hour } = localSlot(at, opts.timeZone);
    const score = scores[slotIndex(weekday, hour)];
    if (!best || score > best.score) best = { at, score };
  }
  return best;
}

export function topSlots(scores: number[], n: number): { weekday: number; hour: number; score: number }[] {
  return scores
    .map((score, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
