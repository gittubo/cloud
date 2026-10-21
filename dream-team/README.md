# AI Dream Team: wholesale real estate

Six agents that take a US property list all the way to an assigned contract.
Every text, email, offer and buyer blast they write waits in an **approval queue**:
nothing reaches a seller or buyer until you approve it.

| Agent | Replaces | What it does |
|---|---|---|
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

**The app is free.** All six agents run on built-in rules and message templates, so
you don't need any paid tool or API key.

**Optional: Claude rewrites the drafts.** Set `ANTHROPIC_API_KEY` before `npm start`
and the ISA, Negotiator and Dispositions agents will have Claude polish each message.
The numbers and the MAO cap stay rule-based either way. Each draft is a short request
billed per token to your Anthropic account. Choose the model with `DREAM_MODEL`; it
defaults to `claude-opus-5-5`, and `claude-haiku-5-5` is the cheapest.

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
CSV lists ──► Lead Scout ──► ISA ──► Deal Analyst ──► Negotiator ──► contract ──► TC + Dispositions
                 score        drafts      ARV/MAO        drafts                       tasks + blasts
                               │                          │                              │
                               └──────────────► Approval queue (you) ◄───────────────────┘
```

| Path | Contents |
|---|---|
| `src/agents/` | One file per agent, each pure logic you can test |
| `src/team.ts` | Hands a lead from agent to agent and queues the drafts |
| `src/llm.ts` | Optional Claude polish |
| `src/server.ts` | The dashboard and JSON API |
| `public/index.html` | The dashboard |

The formula, the fee and the repair cost per sqft are all editable under **Settings**.
