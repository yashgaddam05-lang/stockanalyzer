// Product knowledge for the in-app research assistant (signed in and signed out). Mirrors the Methodology page and app navigation;
// update both together when the model or the app changes.

export const ASSISTANT_KNOWLEDGE = `
# 3x Hunter: what it is
3x Hunter is an educational stock research app. It scores US-listed stocks (the S&P 500 plus curated growth names,
and any Nasdaq/NYSE/Cboe stock a user adds) on how well they fit the profile of companies that have historically had
room for a large move. It is not investment advice, places no trades, and connects to no brokerage.

# The 3x Opportunity Score (0-100, model v2.2)
A deterministic heuristic combining 9 weighted dimensions. Each dimension is scored 0-100 from its inputs; the total is
the weighted average of the dimensions that have data. Missing dimensions are left unscored and their weight is
re-normalized across the rest, so the total stays on a 0-100 scale. Missing inputs are never fabricated.
- Growth Potential (18%): revenue growth YoY, earnings growth YoY, R&D ratio.
- Valuation Upside (13%): forward P/E, price/sales, PEG, analyst mean target vs current price.
- Room to 3x (20%): market cap (log scale, $1B and below scores highest, $1T+ lowest) plus analyst mean and high
  targets as multiples of the price (needs 3+ analysts). A huge company needs far more new value to triple.
- Momentum (13%): momentum score, position within the 52-week high/low range.
- Fundamental Quality (10%): gross, operating and net margin, debt/equity, cash runway.
- Catalyst Strength (10%): pipeline count, R&D ratio.
- Market Position (5%): market cap, gross margin, average volume.
- Risk & Volatility (6%): volatility, beta (higher means a wider range of outcomes, scored as opportunity; downside
  is in the separate risk score).
- Market Regime Fit (5%): how well the stock's profile fits today's market backdrop.
Reading it: 70+ is a strong fit, 55-69 decent, 40-54 middling, under 40 weak. A high score is a stronger model fit,
not a prediction that the price will triple.
Confidence: high when at least 85% of the weight has data, medium from 65% to 85%, low below 65%.
Score change: the difference from the previous recorded snapshot. Scores are recomputed after each data refresh.

# Risk score (0-100, higher = riskier)
Separate from the opportunity score; a stock can be high on both. Bands: low 0-29, medium 30-54, high 55-74,
extreme 75-100. Inputs (weighted, averaged over those available): annualized volatility, beta, debt/equity, cash
runway, market cap (log scale, smaller is riskier), net profit margin (falls back to earnings growth direction).
With no risk inputs the score defaults to a neutral 50. The stock page also lists invalidation signals such as
decelerating revenue growth or a break below the 52-week low.

# Bull / neutral / bear cases (stock page)
Generated only from metrics the stock has. Bull: strongest dimensions (60+), plus a revenue-tripling estimate when
growth exceeds 30% and the analyst target when above the price. Neutral: middling dimensions (45-59), unscored
dimensions and confidence. Bear: weakest dimensions (below 45) and the main risk drivers.

# Preset screens (strategies) on Explore
- Highest 3x: every stock ranked by 3x score.
- Best risk-adjusted: opportunity score discounted by risk score; excludes extreme risk.
- Highest momentum: Momentum dimension 60+, strongest trend first.
- Most undervalued: Valuation Upside 50+ (needs valuation data).
- Profitable compounders: positive net (or operating) margin with 10%+ revenue growth.
- Oversold quality: Fundamental Quality 60+ trading in the lower third of its 52-week range or with weak momentum.
- New score breakouts: score up 5+ points since the previous snapshot.
- Lower risk: low or medium risk score, safest first.

# Market regime
A daily snapshot labels the market risk-on, neutral or risk-off from: VIX level, 10-year Treasury yield and its
3-month trend, SPY vs its 200-day moving average and its 3-month return, small-cap (IWM) and Nasdaq (QQQ) relative
strength vs SPY, and sector ETF relative strength. Each stock's fit with that backdrop feeds the Market Regime Fit
dimension. No look-ahead: only prices on or before the snapshot date are used.

# Backtest
Uses only score snapshots actually recorded at the time, entry at the next session's close, fixed forward horizons,
compared with SPY, one model version at a time. History is short, so small samples are flagged; past results do not
predict future returns.

# Alerts, portfolios, filings, data
- Alerts are in-app only (no email/SMS/push). Price and score thresholds fire once when crossed and re-arm after the
  condition clears. Score-change alerts compare consecutive snapshots; catalyst alerts fire once per event.
- Simulated portfolios are hypothetical: no money, no orders, no fees/taxes/dividends modeled.
- SEC filings and Form 4 insider trades come from SEC EDGAR, are context only and do not change the score.
- Data: Yahoo Finance (unofficial endpoints) fetched server-side, refreshed through the trading day in batches;
  SEC EDGAR daily. Data can be delayed. "Seed" badges mark placeholder values not yet refreshed.

# Using the app (signed-in pages under /app)
- Dashboard (/app): the user's own stocks table, portfolio snapshot, alerts, upcoming catalysts, then a market view
  (top opportunities, score movers, sector x market-cap heat map, preset screens, market regime). A toggle switches
  the view between My stocks, S&P 500 and All tracked.
- Search bar (top of every page): find any Nasdaq/NYSE/Cboe stock. Untracked stocks can be added; they are fetched and
  scored within seconds (up to 10 new stocks per user per day).
- Explore (/app/explore): filter/sort the universe and run preset screens.
- Stock page (/app/stock/TICKER): score breakdown by dimension, risk panel, scenarios, score history, price chart,
  filings, scenario calculator, set alerts, add to watchlist.
- Watchlists (/app/watchlists), Alerts (/app/alerts), Portfolios (/app/portfolios), Catalysts (/app/catalysts),
  Market regime (/app/market), Backtest, Data health, Account (/app/account). "Personalize" in the account menu reruns
  the onboarding setup (goal, experience, risk, stocks).
- Methodology (/methodology) explains all of the above in full.

# Public pages (no account needed)
- Home (/): what 3x Hunter does, the features, how it works, and sign-up. "Find stocks with room to run. See exactly why."
- Pricing (/pricing): Free plan forever: 3x and risk scores on every stock, dashboard, Explore, watchlists, simulated
  portfolios and brokerage import, portfolio score and tips, bots, track record, catalysts, market regime, 100 AI
  credits a month and 1 alert. Pro is $19/month or $149/year: full 3x score breakdown with all factors,
  bull/neutral/bear scenarios, 600 AI credits a month with Deep dive answers, the voice assistant and up to 50 alerts.
  Pro+ is $49/month or $399/year: everything in Pro, 1,600 AI credits a month and Full report answers. Credit packs:
  250 credits for $10 (Pro and Pro+), never expire.
  AI answer sizes and credits: Quick 1 (app help), Standard 3 (focused, from app data and today's shared research),
  Researched 10 (live research on the stocks asked about), Deep dive 40 (full analyst depth, Pro), Full report 100
  (Pro+). Auto picks the size; the size menu sits above the chat box. Monthly credits refresh on the 1st (UTC).
  Checkout and billing are handled by Stripe; cancel anytime from Plan & billing (the plan stays until the period ends).
  Accounts created before paid plans launched are founding members with Pro free until January 31, 2027.
- Methodology (/methodology) explains all of the above in full.

# Public pages (no account needed)
- Home (/): what 3x Hunter does, the features, how it works, and sign-up. "Find stocks with room to run. See exactly why."
- Pricing (/pricing): Free plan forever: 3x and risk scores on every stock, dashboard, Explore, watchlists, simulated
  portfolios and brokerage import, portfolio score and tips, bots, track record, catalysts, market regime, 5 AI
  assistant questions a day and 1 alert. Pro is $19/month or $149/year (save 35%): full 3x score breakdown with all
  factors, bull/neutral/bear scenarios, 40 assistant questions a day, the voice assistant and up to 50 alerts.
  Checkout and billing are handled by Stripe; cancel anytime from Plan & billing (Pro stays until the period ends).
  Accounts created before paid plans launched are founding members with Pro free until January 31, 2027.
- Methodology (/methodology): every weight, input and threshold of the 3x score and risk score. No black box.
- Track record (/track-record): what following the 3x score every quarter since 2016 would have done, rebuilt from data
  available at the time (point-in-time S&P 500 members), compared with holding the S&P 500.
- Legal (/legal/disclaimer, /legal/terms, /legal/privacy). Sign up (/signup), log in (/login), password reset.
- Accounts: email and password, a one-time email code, or Google. Users can ask to have their account and data deleted.
- Installable app: 3x Hunter can be installed on phone or desktop ("Install app" button).

# More signed-in features
- Onboarding (/app/welcome): a short interview (goal: find multibaggers / track my stocks / get ideas / learn;
  experience; risk tolerance; sectors; starter stocks) that personalizes the dashboard. Rerun via "Personalize".
- Portfolios (/app/portfolios): simulated portfolios with unrealized P/L, sector and risk exposure, a 0-100 portfolio
  score, a per-holding report (3x score plus analyst view) and improvement tips. Flags a single position over 25% or a
  sector over 40%. "Import holdings" reads a brokerage CSV export: positions files from Fidelity, Schwab, Vanguard,
  E*TRADE, Webull and most others, Robinhood's "Account activity" CSV (replayed with average cost, since Robinhood has
  no positions export), or pasted lines "TICKER SHARES [COST]". The file is parsed in the browser and previewed before
  anything is saved. There is no live brokerage connection and no trading.
- 3x Bots (/app/bots): four rule-based bots picking from S&P 500 members, from calm to wild: Steady, Balanced, Growth,
  Moonshot. Each shows its history since 2016 vs the S&P 500, 5- and 10-year projections (5,000 random replays of its
  own monthly history; "likely" is the middle outcome, the range the middle 80%) and today's picks. "Follow this bot"
  puts its picks into a simulated portfolio.
- Catalysts (/app/catalysts): upcoming earnings, regulatory, clinical and product events across tracked stocks,
  ranked by expected value: chance of a good reaction x typical up-move minus chance of a bad reaction x typical
  down-move, from base rates by event type (FDA approvals ~85-90%, Phase 3 ~58%, Phase 2 ~40%, earnings ~53%) scaled
  by company size and volatility. Users can add catalysts.
- Smart money (stock page): holders among 41 specialist health-care funds from 13F filings with quarter-over-quarter
  changes, plus C-suite open-market insider buys from Form 4.
- Track record (/app/track-record) and Backtest (/app/backtest): historical tests of the score; Data health
  (/app/data-health): freshness and coverage of the data.
- Research assistant (this chat): signed-in users get full stock and portfolio analysis that reads their saved
  profile and portfolios, uses live web data, and remembers summaries of their earlier chats in their own account.
`.trim();
