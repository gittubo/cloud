# AI Dream Team: wholesale real estate

Seven agents that take a US property list all the way to an assigned contract.

The **Acquisition Manager** works on its own. It answers seller calls and texts 24/7,
answers their questions, negotiates and gets a verbal "yes". It cannot commit you to
anything: when a seller agrees, you get a **"Seller agreed at $X: send contract?"**
alert, and one tap sends it.

The other agents' messages wait in an **approval queue** until you approve them.

| Agent | Replaces | What it does |
|---|---|---|
| **Atlas** (Claude vision) | driving for dollars | Give it a zip code and it finds the home addresses there, looks at each house's Google Street View photo, and flags the ones that look run down or abandoned: boarded windows, overgrown yard, roof tarp, peeling paint, junk. Flagged houses go into your pipeline with the photo and reasons, and the Lead Scout ranks them higher. It can also scan a county list you import. |
| **Acquisition Manager** (Claude) | ISA + acquisitions manager | Talks to sellers by phone or text, day and night. It builds rapport, answers questions ("how does this work?", "why less than Zillow?", "is this a scam?", "what's an assignment?"), qualifies the seller, makes the offer and handles counters. Price rules are enforced in code: it can only say numbers the Deal Analyst gives it, it never learns your MAO, and any agreement above MAO is refused. It says it's a virtual assistant, honours "stop" instantly and hands you anything it shouldn't handle (legal questions, upset sellers, missing comps). |
| **Lead Scout** | list-stacking VA | Scores each property 0–100 for seller motivation: pre-foreclosure, tax-delinquent, probate, vacant, absentee, code violations, equity, years owned. Drops leads with too little equity to wholesale. |
| **ISA** | inside sales / cold caller | Writes the first-touch text and a call script, then reads each seller reply and pulls out the five things you need before an offer: motivation, condition, timeline, asking price, occupancy. Keeps asking until it has them. |
| **Deal Analyst** | acquisitions manager (numbers) | Picks sold comps (same zip, last 12 months, ±25% sqft, not distressed), computes ARV, estimates repairs from condition and age, and sets **MAO = ARV × 70% − repairs − your fee** plus an opening offer. Every number comes with the reasoning. |
| **Negotiator** | acquisitions manager (closing) | Writes the offer, with the assignment disclosed, and answers counters on a concession ladder that **never goes above MAO**. Handles the usual objections: "Zillow says more", "too low", "I'll list it", "need to think". |
| **Dispositions** | dispo manager | Matches the contract to your cash buyers by area, budget, bedrooms and how recently they bought, then writes the deal blast. |
| **Transaction Coordinator** | TC | Turns a signed contract into a dated closing checklist: title, EMD, inspection deadline, assignment, closing. It adds extra steps for probate, pre-foreclosure and tenants. |

## Run it

You need Node.js 22.18 or newer (free from nodejs.org).

```bash
cd dream-team
npm install
npm start          # open http://localhost:4321
npm test
```

Click **Load sample data** to try the whole pipeline with six made-up leads. Then
open a lead and follow steps 1 → 4 on its page.

Your data is saved to `dream-team/data/db.json`. Back that file up; it's git-ignored.

## Costs

| Part | Cost |
|---|---|
| Scout, Analyst, Negotiator drafts, Dispositions, TC, dashboard | Free. They run on built-in rules. |
| **Acquisition Manager** (Claude) | Needs an Anthropic API key (`ANTHROPIC_API_KEY`). It runs on `claude-opus-5-5`, the strongest negotiator, at roughly **$0.20–$0.50 per conversation**. `DREAM_MODEL=claude-sonnet-5-5` costs about half that, and `claude-haiku-5-5` costs about 1–2 cents but negotiates noticeably worse. |
| Phone line (Twilio) | A US number is about $1–2 a month. Calls and texts cost a few cents a minute or message. Check Twilio's current pricing. |
| Always-on server | $0–6 a month (see below). |
| Telegram alerts | Free. |

With an API key set, Claude also polishes the other agents' template drafts.

## Atlas: find run-down houses from street photos

1. **Get a Google Maps API key.** Create a Google Cloud project, turn on the **Street View
   Static API**, and create an API key. Google asks for a payment card but gives a free
   monthly allowance of Street View requests, so check Google's current Maps pricing. The
   "is there a photo here?" check Atlas runs first is free.
2. **Start the app with both keys:**
   ```bash
   GOOGLE_MAPS_API_KEY=... ANTHROPIC_API_KEY=... npm start
   ```
3. **Open the 🛰️ Atlas tab** and use either button:
   - **Scan this zip:** Atlas finds the home addresses in that zip from OpenStreetMap (free)
     and looks at each one.
   - **Scan my imported leads:** looks at the houses on a list you imported. Use this for a
     whole county: export the county from Propwire, import it, then scan.
4. **Read the results.** Houses rated **6/10 or worse** appear with their photo and the
   reasons. New addresses that look fine are *not* added, so your pipeline only holds
   real prospects.

**Cost:** roughly 1 cent of Claude per house, plus Google's per-photo price once you're past
the free allowance. Start with 50–100 houses. To make large scans cheaper, set
`ATLAS_MODEL=claude-haiku-5-5`; it's fine at spotting boarded windows.

**Limits to know:**
- Street View photos can be **a few years old**, and each result shows the photo date.
  Some streets have no photo at all.
- OpenStreetMap's address coverage varies by county. If a zip returns few addresses, import
  a property list and use "Scan my imported leads".
- A rough-looking house still needs the usual checks: owner, equity and the Deal Analyst's
  numbers.

## Try the Acquisition Manager now (no phone line needed)

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Open **http://localhost:4321/call**. You play the seller: pick a sample lead or "New
caller", choose **Phone call** or **Text messages**, and talk to it. In Chrome you can
use the 🎤 button to speak and hear it reply. Try pushing back on price, asking
"is this a scam?", or saying "stop". Every outcome lands in the dashboard **Inbox**.

## Turn on the 24/7 phone line

1. **Host it somewhere that stays on.** Twilio must reach the app while you sleep. You can
   use a small VPS (around $4–6 a month) or any Node host with a persistent disk, so
   `data/db.json` survives restarts. To test from your laptop, a free tunnel such as
   `cloudflared tunnel --url http://localhost:4321` gives you a temporary public URL.
2. **Create a Twilio account** and buy a US phone number with voice and SMS.
3. **Start the app with:**
   ```bash
   ANTHROPIC_API_KEY=...          # Claude
   PUBLIC_URL=https://your-app.example.com
   DASHBOARD_PASSWORD=...         # required once the app is public
   HOST=0.0.0.0                   # on a server
   TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_PHONE_NUMBER=+1...
   npm start
   ```
4. **In Twilio, set your number's webhooks.** Set "A call comes in" to
   `https://your-app.example.com/twilio/voice` and "A message comes in" to
   `https://your-app.example.com/twilio/sms` (both HTTP POST). The app rejects any
   request that isn't signed by your Twilio account.
5. **Texting US numbers from a business line requires A2P 10DLC registration** in Twilio.
   Start it early, because approval takes time.

Each phone turn takes a few seconds while Claude thinks. That's fine for
acquisitions calls, and the voice is Twilio's built-in Amazon Polly voice.

### What the AI may and may not do on the phone

- **It answers every inbound call and text.** That covers sellers responding to your
  mail, ads, signs or texts.
- **It calls back only sellers who said yes** to "Is it OK if we call or text you at this
  number?", and only between 8am and 9pm in the seller's time zone. Press **📞 AI calls
  them back** on the lead.
- **It never cold-calls lists.** US law (the TCPA) treats AI voices as "artificial voice"
  calls that need the person's prior consent, with penalties of $500–$1,500 *per call*.
  To reach new leads, use the approval-queue texts, mail or ads, and let the AI handle
  whoever responds.

## Get "seller agreed" alerts on your phone (free, via Telegram)

1. In Telegram, message **@BotFather**, send `/newbot` and copy the token.
2. Send any message to your new bot. Then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": ...}`.
3. Start the app with `TELEGRAM_BOT_TOKEN=<TOKEN> TELEGRAM_CHAT_ID=<id>`.

You'll get every alert on your phone. Deal alerts come with **✅ Send contract** and
**❌ Decline** buttons, which work even when the app is on a laptop with no public address.

Approving a deal fills in a purchase agreement (the **Open contract** link on the lead)
and adds a task to send it for e-signature. Have a local attorney or title company
approve the template first. Sending it through an e-signature service is still a manual
step for now.

## Getting data without paying for tools

Every import takes CSV files and recognises the column names that common list providers use.

| You need | Free or low-cost source |
|---|---|
| **Motivated-seller lists** | **Propwire** (free account): filter by pre-foreclosure, vacant, absentee, high equity or tax liens, then export CSV. Also try the county treasurer's free tax-delinquent list, county court foreclosure (lis pendens) filings and probate court records. |
| **Owner phone numbers** (skip tracing) | Free but slow: look owners up by hand on public people-search sites. Paid: bulk skip tracing costs roughly cents per record. Start with your 20 highest-scored leads. |
| **Sold comps** | Redfin or Zillow, filtered to **Sold** in the last 6–12 months in the same zip. Copy them into a CSV with Address, Zip, Sold Price, Sold Date, Sqft and Condition. |
| **Cash buyers** | Propwire's cash-buyer filter, LLC buyers in county deed records, and local investor Facebook groups and REIA meetups. |

The sample files in `sample/` show every column the importer understands.

## Working from outside the US

- **A US phone number.** Sellers answer local numbers. A VoIP number with texting
  works from anywhere; set it as your callback number in **Settings**.
- **Texting rules (TCPA and DNC).** Don't blast cold texts from an autodialer, and
  scrub your list against the National Do Not Call Registry. The first-touch text
  always includes "Reply STOP to opt out", so honour every STOP.
- **State wholesaling laws.** Several states, including Illinois, Pennsylvania,
  Oklahoma and South Carolina, require a license, written disclosure or both before
  you market a contract. Pick a wholesaler-friendly state to start in, and have an
  investor-friendly title company or attorney check your purchase and assignment
  agreements. The Negotiator always discloses that you may assign the contract.
- **Closing remotely.** Investor-friendly title companies handle remote, e-signed
  closings and hold the earnest money. The Transaction Coordinator's checklist
  follows that flow.

This tool does not give legal advice. Check your state's rules before you contract a property.

## How it fits together

```
Seller calls/texts ──► Acquisition Manager (Claude) ──get_offer──► Deal Analyst + Negotiator rules
     (Twilio)              │  answers, qualifies,                    (ARV, MAO, concession ladder)
                           │  negotiates                                      │
                           ▼                                                  │
              "Seller agreed at $X" ──► you tap ✅ ──► contract ──► TC + Dispositions
                (Inbox / Telegram)

CSV lists ──► Lead Scout ──► ISA / Negotiator drafts ──► Approval queue (you)
```

| Path | Contents |
|---|---|
| `src/agents/acquisitions.ts` | The Acquisition Manager: the Claude conversation loop, its tools and the money rules |
| `src/agents/knowledge.ts` | What it knows about how cash and assignment deals work |
| `src/agents/` | The other agents, each pure logic you can test |
| `src/phone.ts` | Twilio voice and SMS, signature checks, consented callbacks |
| `src/notify.ts` | Inbox and Telegram alerts |
| `src/contract.ts` | Purchase agreement draft |
| `src/team.ts` | Hands a lead from agent to agent |
| `src/server.ts` | The dashboard, JSON API and webhooks |
| `public/index.html` | The dashboard |
| `public/call.html` | The test-call page |

The formula, the fee and the repair cost per sqft are all editable under **Settings**.
