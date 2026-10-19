import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = promisify(execFile);
const CLI = resolve("src/cli.ts");

test("schedule uploads media once and creates one live post per platform", async () => {
  const dir = await mkdtemp(join(tmpdir(), "social-agent-"));
  try {
    // A fake Postiz CLI that records its arguments and answers like the real one.
    const fake = join(dir, "postiz");
    await writeFile(fake, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, "calls.jsonl"))}, JSON.stringify(args) + "\\n");
if (args[0] === "upload") console.log(JSON.stringify({ path: "https://cdn/" + args[1] }));
else console.log("Using API key\\n" + JSON.stringify([{ postId: "post_" + args[args.indexOf("-i") + 1] }]));
`);
    await chmod(fake, 0o755);
    await writeFile(join(dir, "social-agent.config.json"), JSON.stringify({
      timeZone: "Africa/Lagos",
      brand: { name: "B", voice: "v", audience: "a", goal: "g" },
      integrations: { x: "int_x", tiktok: "int_tt" },
      settings: { x: { who_can_reply_post: "following" } },
      scheduling: { minLeadMinutes: 30, horizonDays: 7, minGapHours: 20 },
    }));
    await mkdir(join(dir, "plans"));
    const plan = {
      id: "p1", createdAt: "2026-10-19T00:00:00Z", brief: "b", media: ["cover.jpg", "clip.mp4"], skipped: [],
      posts: [
        { platform: "x", text: "t", hashtags: [], caption: "Hello X", hookRationale: "", at: "2026-10-20T07:00:00.000Z", score: 2 },
        { platform: "tiktok", text: "t", hashtags: ["fyp"], caption: "Hello TT\n\n#fyp", hookRationale: "", at: "2026-10-20T19:00:00.000Z", score: 2 },
      ],
    };
    await writeFile(join(dir, "plans/p1.json"), JSON.stringify(plan));

    const env: NodeJS.ProcessEnv = { ...process.env, POSTIZ_BIN: fake };
    for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
    await run(process.execPath, [CLI, "schedule", "plans/p1.json", "--live"], { cwd: dir, env });

    const calls = (await readFile(join(dir, "calls.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(calls.filter((c) => c[0] === "upload").map((c) => c[1]), ["cover.jpg", "clip.mp4"]);
    const [x, tt] = calls.filter((c) => c[0] === "posts:create");
    assert.equal(x[x.indexOf("-m") + 1], "https://cdn/cover.jpg,https://cdn/clip.mp4");
    assert.deepEqual(JSON.parse(x[x.indexOf("--settings") + 1]), { who_can_reply_post: "following" });
    assert.equal(tt[tt.indexOf("-m") + 1], "https://cdn/clip.mp4", "TikTok gets only the video");
    assert.equal(JSON.parse(tt[tt.indexOf("--settings") + 1]).content_posting_method, "DIRECT_POST");
    assert.ok(!x.includes("draft") && !tt.includes("draft"));

    const history = JSON.parse(await readFile(join(dir, "data/history.json"), "utf8"));
    assert.deepEqual(history.map((h: { postizId: string; status: string }) => [h.postizId, h.status]),
      [["post_int_x", "scheduled"], ["post_int_tt", "scheduled"]]);

    await assert.rejects(run(process.execPath, [CLI, "schedule", "plans/p1.json"], { cwd: dir, env }), /already sent/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
