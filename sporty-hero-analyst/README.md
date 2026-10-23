# Sporty Hero Analyst

A single-page analyst for the Sporty Hero crash game on SportyBet. Live version: https://claude.ai/artifact/3x8GztxeN3MnwPiwnMq2X4

| Tab | What it does |
|---|---|
| Analysis | Hit rates against the published odds (RTP ÷ multiplier), what a fixed auto-cashout would have returned, a streak table, and chi-square, runs and lag-1 randomness tests |
| Rounds | Paste multipliers in any format, or have the AI read a screenshot of the history |
| Strategy lab | Monte Carlo of 3,000 sessions for flat, martingale or Paroli staking, using the game's odds or your own history |
| Session guard | Logs your bets and warns at 75% and 100% of your loss and time limits |
| Ask the analyst | Chat with Claude about your stats. It explains odds and risk and never predicts rounds |

The AI features use the Claude artifact runtime (`sample` capability), so they only work when the page is opened in Claude. Every other tab works offline in any browser. Data stays in the browser's `localStorage`.

The file is an artifact page body (no `<!doctype>`/`<html>` wrapper), which the publisher adds. It is not part of the Vite site build.
