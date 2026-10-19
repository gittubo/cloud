import { test } from "node:test";
import assert from "node:assert/strict";
import { benchmark, localSlot, pickTime, slotIndex, slotScores, topSlots, type Observation } from "../src/timing.ts";

const TZ = "Africa/Lagos"; // UTC+1, no DST
const MONDAY_MIDNIGHT_UTC = new Date("2026-10-19T00:00:00Z");
const opts = { now: MONDAY_MIDNIGHT_UTC, timeZone: TZ, minLeadMinutes: 30, horizonDays: 7, minGapHours: 20, taken: [] };

test("benchmarks favour weekday business hours on LinkedIn", () => {
  const w = benchmark("linkedin");
  assert.ok(w[slotIndex(2, 9)] > w[slotIndex(6, 9)], "Tue 9am beats Sat 9am");
  assert.ok(w[slotIndex(2, 9)] > w[slotIndex(2, 3)], "Tue 9am beats Tue 3am");
});

test("localSlot reads weekday and hour in the audience time zone", () => {
  assert.deepEqual(localSlot(new Date("2026-10-19T23:30:00Z"), "Asia/Tokyo"), { weekday: 2, hour: 8 });
  assert.deepEqual(localSlot(new Date("2026-10-19T23:30:00Z"), TZ), { weekday: 2, hour: 0 });
});

test("without data, scores are the benchmark normalised to an average of 1", () => {
  const scores = slotScores("x", [], TZ);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  assert.ok(Math.abs(mean - 1) < 1e-9);
});

test("the account's own results move the best slot", () => {
  // Sunday 03:00 local is near-dead in the benchmark, but this audience loves it.
  const obs: Observation[] = [];
  for (let week = 0; week < 6; week++) {
    const sunday3am = new Date(Date.UTC(2026, 8, 6 + week * 7, 2)); // 02:00Z = 03:00 Lagos, Sundays
    obs.push({ postedAt: sunday3am.toISOString(), engagement: 500 });
    const tuesday10am = new Date(Date.UTC(2026, 8, 8 + week * 7, 9));
    obs.push({ postedAt: tuesday10am.toISOString(), engagement: 20 });
  }
  const scores = slotScores("instagram", obs, TZ);
  assert.deepEqual(topSlots(scores, 1)[0], { weekday: 0, hour: 3, score: topSlots(scores, 1)[0].score });
  assert.ok(scores[slotIndex(2, 10)] < scores[slotIndex(3, 11)], "the weak Tuesday slot drops below an untested one");
});

test("a single lucky post does not override the benchmark", () => {
  const obs = [
    { postedAt: "2026-10-04T02:00:00Z", engagement: 1000 }, // Sun 03:00
    { postedAt: "2026-10-06T09:00:00Z", engagement: 10 },
  ];
  const best = topSlots(slotScores("linkedin", obs, TZ), 1)[0];
  assert.ok([2, 3, 4].includes(best.weekday), `best day is still Tue-Thu, got ${best.weekday}`);
  assert.ok(best.hour >= 8 && best.hour < 11, `best hour is still the morning, got ${best.hour}`);
});

test("pickTime chooses the earliest top slot in local time", () => {
  const slot = pickTime(slotScores("linkedin", [], TZ), opts)!;
  assert.equal(slot.at.toISOString(), "2026-10-20T07:00:00.000Z"); // Tue 08:00 Lagos
});

test("pickTime keeps posts on one platform apart", () => {
  const taken = [new Date("2026-10-20T07:00:00Z")];
  const slot = pickTime(slotScores("linkedin", [], TZ), { ...opts, taken })!;
  assert.equal(slot.at.toISOString(), "2026-10-21T07:00:00.000Z"); // Wed 08:00 Lagos
});

test("pickTime never schedules inside the lead time", () => {
  const now = new Date("2026-10-20T06:45:00Z"); // Tue 07:45 Lagos
  const slot = pickTime(slotScores("linkedin", [], TZ), { ...opts, now })!;
  assert.ok(slot.at.getTime() >= now.getTime() + 30 * 60_000);
  assert.equal(slot.at.getUTCMinutes(), 0);
});
