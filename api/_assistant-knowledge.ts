// Product knowledge for the in-app help assistant. Mirrors the Methodology page and app navigation;
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
`.trim();
