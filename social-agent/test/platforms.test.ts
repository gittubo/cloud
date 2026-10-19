import { test } from "node:test";
import assert from "node:assert/strict";
import { captionProblems, composeCaption, mediaProblem } from "../src/platforms.ts";

test("composeCaption appends hashtags with a single #", () => {
  assert.equal(composeCaption(" Hello ", ["build", "#design"]), "Hello\n\n#build #design");
  assert.equal(composeCaption("Hello", []), "Hello");
});

test("X posts over 280 characters including hashtags are rejected", () => {
  assert.deepEqual(captionProblems("x", "a".repeat(270), ["exactly"]), []); // 270 + 2 + 8 = 280
  assert.match(captionProblems("x", "a".repeat(271), ["exactly"]).join(), /281 chars, limit is 280/);
  assert.match(captionProblems("x", "hi", ["a", "b", "c"]).join(), /at most 2/);
});

test("media requirements per platform", () => {
  assert.match(mediaProblem("tiktok", ["photo.jpg"])!, /video/);
  assert.equal(mediaProblem("tiktok", ["photo.jpg", "clip.MP4"]), null);
  assert.match(mediaProblem("instagram", [])!, /image or video/);
  assert.equal(mediaProblem("linkedin", []), null);
});
