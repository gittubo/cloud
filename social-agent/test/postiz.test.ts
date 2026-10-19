import { test } from "node:test";
import assert from "node:assert/strict";
import { createArgs, engagementFrom, findId, parseCliJson } from "../src/postiz.ts";

test("parseCliJson skips a status line before the JSON", () => {
  assert.deepEqual(parseCliJson('Using API key\n[{"id":"a"}]\n'), [{ id: "a" }]);
  assert.throws(() => parseCliJson("Not authenticated"), /no JSON/);
});

test("createArgs builds a scheduled post with media and settings", () => {
  const args = createArgs({
    integrationId: "int_1", content: "Hi", at: new Date("2026-10-20T07:00:00Z"),
    mediaUrls: ["https://u/1.jpg", "https://u/2.jpg"], settings: { post_type: "post" }, draft: false,
  });
  assert.deepEqual(args, [
    "posts:create", "-c", "Hi", "-s", "2026-10-20T07:00:00.000Z", "-i", "int_1",
    "-m", "https://u/1.jpg,https://u/2.jpg", "--settings", '{"post_type":"post"}',
  ]);
  const draft = createArgs({ integrationId: "i", content: "c", at: new Date(0), mediaUrls: [], settings: {}, draft: true });
  assert.deepEqual(draft.slice(-2), ["-t", "draft"]);
  assert.ok(!draft.includes("-m") && !draft.includes("--settings"));
});

test("engagementFrom adds up interactions and ignores reach", () => {
  const analytics = [
    { label: "Impressions", data: [{ total: 900 }, { total: 1500 }] },
    { label: "Likes", data: [{ total: 10 }, { total: 25 }] }, // cumulative -> 25
    { label: "Comments", data: [{ total: 4 }, { total: 1 }] }, // daily -> 5
  ];
  assert.equal(engagementFrom(analytics), 30);
  assert.equal(engagementFrom({ missing: true }), null);
  assert.equal(engagementFrom([{ label: "Impressions", data: [{ total: 5 }] }]), null);
});

test("findId reads the post id from common response shapes", () => {
  assert.equal(findId([{ postId: "p1", integration: "x" }]), "p1");
  assert.equal(findId({ posts: [{ id: "p2" }] }), "p2");
  assert.equal(findId({ ok: true }), null);
});
