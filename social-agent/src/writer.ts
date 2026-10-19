import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PLATFORMS, RULES, captionProblems, mediaKind, type Platform } from "./platforms.ts";
import type { Brand } from "./store.ts";

const MODEL = "claude-opus-5-5";

const VariantsSchema = z.object({
  variants: z.array(
    z.object({
      platform: z.enum(PLATFORMS),
      text: z.string(),
      hashtags: z.array(z.string()),
      hook_rationale: z.string(),
    }),
  ),
});

export type Variant = z.infer<typeof VariantsSchema>["variants"][number];

const SYSTEM = `You are a senior social media strategist and copywriter. You turn one content brief into a native post for each requested platform, written to maximise genuine engagement (comments, shares, saves) for that platform's algorithm and audience.

Principles:
- Each platform gets its own post, not the same text resized. Match its culture and format.
- The first line decides whether anyone reads on: open with a concrete hook (a surprising fact, a bold claim, a question, a tension).
- Give people a reason to respond: a specific question, an opinion to agree or argue with, something worth saving or sending to a friend.
- Stay true to the brief and the brand voice. Never invent facts, numbers, prices, dates or testimonials that are not in the brief.
- No engagement bait the platforms penalise ("like if you agree", "tag 10 friends"), no clickbait that the post does not pay off.
- Hashtags go in the hashtags list without the # sign, never in the text. Pick specific ones over generic ones.

Platform rules:
${PLATFORMS.map((p) => `- ${p} (${RULES[p].label}): aim for about ${RULES[p].idealChars} characters, never more than ${RULES[p].maxChars} including hashtags; at most ${RULES[p].maxHashtags} hashtags. ${RULES[p].style}`).join("\n")}`;

export interface WriteRequest {
  brief: string;
  platforms: Platform[];
  brand: Brand;
  media: string[];
}

function userPrompt(req: WriteRequest): string {
  const media = req.media.length
    ? req.media.map((m) => `- ${m} (${mediaKind(m) ?? "file"})`).join("\n")
    : "none (text-only post)";
  return `Brand: ${req.brand.name}
Voice: ${req.brand.voice}
Audience: ${req.brand.audience}
Goal: ${req.brand.goal}

Attached media:
${media}

Brief:
${req.brief}

Write one post for each of these platforms, in this order: ${req.platforms.join(", ")}.`;
}

export async function writeVariants(req: WriteRequest, client = new Anthropic()): Promise<Variant[]> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userPrompt(req) }];
  // One retry: show the model exactly what broke the platform limits.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(VariantsSchema) },
      system: SYSTEM,
      messages,
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined this brief: ${response.stop_details?.explanation ?? "no reason given"}`);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`Claude returned no usable output (stop reason: ${response.stop_reason})`);

    const variants = req.platforms.map((p) => parsed.variants.find((v) => v.platform === p));
    const problems = req.platforms.flatMap((p, i) => {
      const v = variants[i];
      if (!v) return [`${p}: missing`];
      return captionProblems(p, v.text, v.hashtags).map((msg) => `${p}: ${msg}`);
    });
    if (!problems.length) return variants as Variant[];
    if (attempt === 1) throw new Error(`Copy still breaks platform rules:\n${problems.join("\n")}`);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `These posts break the platform rules. Rewrite all of them, fixing these:\n${problems.join("\n")}`,
    });
  }
  throw new Error("unreachable");
}
