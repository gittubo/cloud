# social-agent

An AI agent that turns one brief into a native post for **Instagram, Facebook, X, LinkedIn and TikTok**, and schedules each one at the hour your audience is most likely to engage. It learns from your own results over time.

```
brief + media ──▶ Claude writes a post per platform ──▶ timing engine picks each post's best hour
                                                                      │
          learn ◀── engagement from each post ◀── Postiz publishes ◀──┘
```

## How it decides

**What to say.** Claude (`claude-opus-5-5`) writes a separate post for each platform rather than one caption resized. Each post follows that platform's culture, length, hook and hashtag norms. It opens on a strong hook and gives people a reason to comment, share or save. It never invents facts that are not in your brief, and it avoids the engagement bait that platforms penalise. Every post is checked against the platform's hard limits, and Claude rewrites any that break them.

**When to post.** Every hour of the week, in your audience's time zone, gets a score:

1. **Day one:** benchmark windows from the large industry studies, for example LinkedIn Tue–Thu 8–11am and TikTok evenings.
2. **As you post:** `learn` pulls each post's interactions (likes, comments, shares, saves, reposts) and compares them with what the benchmark expected for that hour. Hours and days that beat expectations rise; ones that miss sink. One lucky post can't change the schedule, but a consistent pattern will.

Posts on the same platform are kept at least `minGapHours` apart, so you don't compete with yourself.

**Publishing.** [Postiz](https://postiz.com) holds the connections to all five networks and publishes at the scheduled time. You connect each account once in Postiz. You don't need a Meta app review, a paid X API plan, a TikTok audit or LinkedIn partner approval.

## Setup

Needs Node 22.18+.

```bash
cd social-agent
npm install
npm install -g postiz           # publishing CLI
postiz auth:login               # or: export POSTIZ_API_KEY=...
export ANTHROPIC_API_KEY=...    # from console.anthropic.com
cp social-agent.config.example.json social-agent.config.json
```

1. In Postiz, connect your Instagram, Facebook, X, LinkedIn and TikTok accounts.
2. Run `postiz integrations:list` and paste each id into `integrations` in `social-agent.config.json`. Leave out any platform you don't use.
3. Set `timeZone` to where most of your audience lives (an IANA name such as `Africa/Lagos`, `Europe/London` or `America/New_York`).
4. Describe your `brand`: its voice, its audience and what a great post achieves for you. The better this is, the better the copy.
5. To post to LinkedIn as a company page, add its id under `settings.linkedin.companyId` (`postiz integrations:trigger <id> getCompanies` lists them).
6. Run `npm run agent -- check`. It confirms the accounts are connected and shows each platform's posting rules next to the settings this agent sends.

## Use

```bash
# 1. Write the posts and pick the times (nothing is published yet)
npm run agent -- plan --brief "We just finished the rooftop pool at our Lekki resort; opening weekend is 14-15 Nov" \
                      --media media/pool.jpg,media/pool-tour.mp4

# 2. Review plans/<id>.json (edit any caption or time), then send it
npm run agent -- schedule plans/<id>.json          # as drafts to approve in Postiz
npm run agent -- schedule plans/<id>.json --live   # straight into the publishing queue

# 3. A day or more after posts go out, feed the results back
npm run agent -- learn

# See where the best hours currently are
npm run agent -- slots
```

`--platforms x,linkedin` limits a plan to some platforms.

Media rules:

- Instagram needs an image or video.
- TikTok needs a video, and gets only the video from a plan's media.
- If a platform's media is missing, the plan skips it and says why.

TikTok posts use `DIRECT_POST`, so they really publish rather than wait in your TikTok inbox.

## Files

| Path | What |
|---|---|
| `social-agent.config.json` | Your accounts, brand voice, time zone (not committed) |
| `plans/` | Each plan: per-platform copy, chosen time, slot score, why the hook works |
| `data/history.json` | Every post sent and its measured engagement; this is what timing learns from |

Run `learn` regularly (for example from a daily cron job). The agent measures only posts it scheduled with `--live`. If you schedule drafts yourself in Postiz, change their `status` to `"scheduled"` in `data/history.json` so they count.

## Development

```bash
npm test          # unit tests + an end-to-end schedule run against a fake Postiz CLI
npm run typecheck
```
