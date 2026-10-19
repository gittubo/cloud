export const PLATFORMS = ["instagram", "facebook", "x", "linkedin", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export type MediaKind = "image" | "video";

export interface PlatformRules {
  label: string;
  /** Hard caption limit, counted in characters including hashtags. */
  maxChars: number;
  /** Length that tends to perform best; the writer aims for it. */
  idealChars: number;
  maxHashtags: number;
  /** Media the platform will not publish without. */
  requiresMedia: MediaKind[] | null;
  style: string;
  /** Provider settings Postiz needs; config can override them per account. */
  defaultSettings: Record<string, unknown>;
}

export const RULES: Record<Platform, PlatformRules> = {
  instagram: {
    label: "Instagram",
    maxChars: 2200,
    idealChars: 300,
    maxHashtags: 5,
    requiresMedia: ["image", "video"],
    style:
      "Visual-first. The first line is the hook and must work before the 'more' cut-off (~125 chars). " +
      "Short paragraphs, a few relevant emoji, one clear call to action (save, share or comment). Hashtags at the end.",
    defaultSettings: { post_type: "post" },
  },
  facebook: {
    label: "Facebook",
    maxChars: 63206,
    idealChars: 250,
    maxHashtags: 2,
    requiresMedia: null,
    style:
      "Conversational and community-minded. Ask a question people want to answer in the comments. " +
      "Hashtags are optional and sparing.",
    defaultSettings: {},
  },
  x: {
    label: "X",
    maxChars: 280,
    idealChars: 200,
    maxHashtags: 2,
    requiresMedia: null,
    style:
      "Punchy and opinionated. Lead with the strongest claim or number. No filler, at most two hashtags, " +
      "never a wall of emoji. Must fit in one post.",
    defaultSettings: { who_can_reply_post: "everyone" },
  },
  linkedin: {
    label: "LinkedIn",
    maxChars: 3000,
    idealChars: 1200,
    maxHashtags: 3,
    requiresMedia: null,
    style:
      "Professional but human. A one-line hook, then a short story or insight in skimmable lines, " +
      "a takeaway, and a question that invites expert replies. No external link in the body.",
    defaultSettings: {},
  },
  tiktok: {
    label: "TikTok",
    maxChars: 2200,
    idealChars: 150,
    maxHashtags: 5,
    requiresMedia: ["video"],
    style:
      "Casual, trend-aware caption that complements the video rather than describing it. " +
      "Hook in the first few words, then a mix of niche and broad hashtags.",
    // DIRECT_POST publishes; UPLOAD only drops the video into the TikTok inbox.
    defaultSettings: {
      privacy_level: "PUBLIC_TO_EVERYONE",
      duet: true,
      stitch: true,
      comment: true,
      content_posting_method: "DIRECT_POST",
    },
  },
};

export function mediaKind(file: string): MediaKind | null {
  const ext = file.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  return null;
}

/** Why the given media cannot go to this platform, or null when it can. */
export function mediaProblem(platform: Platform, media: string[]): string | null {
  const required = RULES[platform].requiresMedia;
  if (!required) return null;
  const kinds = media.map(mediaKind);
  if (kinds.some((k) => k !== null && required.includes(k))) return null;
  return `${RULES[platform].label} needs ${required.join(" or ")} media`;
}

export function composeCaption(text: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return tags ? `${text.trim()}\n\n${tags}` : text.trim();
}

/** Problems with a finished caption; empty when it is publishable. */
export function captionProblems(platform: Platform, text: string, hashtags: string[]): string[] {
  const rules = RULES[platform];
  const problems: string[] = [];
  const length = [...composeCaption(text, hashtags)].length;
  if (length > rules.maxChars) problems.push(`${length} chars, limit is ${rules.maxChars}`);
  if (hashtags.length > rules.maxHashtags) {
    problems.push(`${hashtags.length} hashtags, use at most ${rules.maxHashtags}`);
  }
  if (!text.trim()) problems.push("empty text");
  return problems;
}
