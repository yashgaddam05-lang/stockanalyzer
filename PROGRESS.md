# 3x Hunter — Project Progress Tracker

**Last updated:** 2026-10-16
**Current phase:** Phase 1 MVP (subset) — Stage A (items 1–10), Stage B (items 11–15) and Stage C (items 21, 23, 25, 27, 28; partial 18, 19, 22) built on `swarm/wave-2` (pages not yet routed); Stage C app wiring and QA in progress
**Scope reference:** `3x_hunter_app_scope.md` (attached)

---

## 1. Project Overview

3x Hunter is a stock opportunity scanner and research platform that ranks curated stocks by their potential to triple in value using a transparent 0–100 "3x Opportunity Score." For each stock, users see a score, risk classification, catalysts, bull/bear cases, valuation context, and an evidence-based explanation of why it ranks where it does.

**Important positioning:** Educational research and screening tool — not personalized investment advice or an automated investment adviser.

---

## 2. Design Standards

These standards must be followed in every build session to maintain consistency.

### Visual language
- **Aesthetic:** Minimalist finance — clean, sophisticated, neutral. Inspired by financial platforms like Bloomberg Terminal lite, Stripe, and Robinhood.
- **Color palette:** Neutral tones (neutral-50 through neutral-950). No purple, indigo, or violet hues unless explicitly requested.
- **Color system ramp:** primary (neutral-900), secondary (neutral-100), accent (neutral-700), success (emerald), warning (amber), error (red), plus neutral tones. Score colors use neutral-300 through neutral-900 gradient.
- **Font:** System font stack (Inter-like). Maximum 3 font weights.
- **Line spacing:** 150% for body text, 120% for headings.
- **Spacing:** 8px spacing system throughout.
- **No emojis** in UI or responses.
- **Icons:** lucide-react only. No other icon packages.
- **Components:** Radix UI primitives + Tailwind CSS. No additional UI theme packages.
- **Animations:** Subtle micro-interactions — hover states, transitions, slide-up entrance animations. No excessive motion.

### Layout rules
- Responsive: mobile-first with breakpoints at sm (640px), md (768px), lg (1024px).
- Max content width: 6xl (1152px) for main content areas.
- Sticky header with backdrop blur.
- Consistent card-based layout with border-border tokens.
- Progressive disclosure: use modals, drawers, tabs for secondary content.
- Single Responsibility Principle: one view per screen, no stacking unrelated editing states.

### Accessibility
- Sufficient contrast ratios on all background colors, including during transitions.
- Keyboard navigation support (ESC to close modals, etc.).
- ARIA labels on icon-only buttons.

---

## 3. Architecture Standards

### Tech stack
- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS 3 + tailwindcss-animate + Radix UI primitives
- **Icons:** lucide-react
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- **Charts:** Recharts (`recharts@2.15.4`)
- **Data refresh:** Supabase Edge Function (Deno runtime) fetching from Yahoo Finance free endpoints

### Import conventions
- Use `@/` path alias for all project imports (maps to `src/`)
- Example: `import { Stock } from '@/lib/supabase'` not `import { Stock } from '../../lib/supabase'`

### Data access
- Browser never talks to Supabase directly for data; it calls `/api/*` via `src/lib/api.ts`, and the `api/*.ts` routes hold the server-side Supabase access.
- **Auth-only exception:** the browser uses `supabase-js` (`src/lib/auth-client.ts`, `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`) solely for Supabase Auth sign-in/session. The access token is forwarded to `/api/*` as a bearer header; no table reads/writes from the browser.

### File organization
- `src/lib/` — business logic, API clients, utilities
- `src/components/` — feature components (StockDetailModal, StatsOverview, etc.)
- `src/components/ui/` — reusable Radix-based UI primitives (button, card, badge, etc.)
- `src/App.tsx` — main application entry
- `supabase/migrations/` — database migrations
- `supabase/functions/` — edge functions

### Supabase rules
- RLS enabled on every table — no exceptions.
- Shared/public tables: policies scoped to `TO anon, authenticated`.
- User-owned rows: `TO authenticated` with `auth.uid()` ownership checks (e.g. `watchlists.owner_id`); anon access limited to rows with `owner_id IS NULL` (shared anonymous lists).
- DDL via `apply_migration` MCP tool only. Never raw SQL outside that tool.
- DML/diagnostics via `execute_sql` MCP tool.
- Edge functions must include CORS headers on every response.
- Never DROP columns, change column types, or rename tables — those lose user data.

### Build verification
- Run `npm run build` before finishing any task that modifies project files.
- Fix all build failures before reporting completion.

---

## 4. Current State Summary

| Area | Status | Notes |
|---|---|---|
| Phase | Phase 1 MVP subset | Stage A (items 1–10) complete; Stage B (items 11–15) built; Stage C (items 21, 22, 23, 25, 27, 28 + partial 18/19) merged on `swarm/integration` with routes wired (`app-wiring`) |
| Stock universe | 100+ stocks seeded (137 tickers) | Document targets 200–500 |
| Scoring dimensions | 9 of 9 | v2.2 adds Room to 3x (20%: log market cap + analyst mean/high target multiples) and rebalances weights; momentum uses tanh instead of a hard 0 clamp |
| Risk model | Independent 0–100 risk score | Computed from volatility, beta, debt-to-equity, cash runway, market cap |
| UX | Multi-page routing | react-router: Dashboard, Explore, Stock Detail, Watchlists, Methodology; SPA rewrite excludes `/api/` |
| User accounts | Supabase Auth (email/password) | Per-user watchlists via `watchlists.owner_id` + RLS; anonymous shared lists (owner_id NULL) preserved |
| Database tables | 17 of ~30+ (live) | Stage A/B: stocks, watchlist, watchlists, watchlist_items, score_history, catalysts. Stage C: price_daily, market_regime_snapshots, refresh_runs, sec_sync_state, sec_filings, insider_transactions, sec_form4_processed, alerts, alert_events, portfolios, positions. Plus SQL function `score_forward_returns` |
| Data pipeline | 3 edge functions + Vercel `/api/*` routes + Vercel daily crons | `refresh-stocks` v6 (v5 behaviour + writes daily bars to `price_daily`; Supabase deploy version 7); `refresh-market` (daily closes for 23 regime symbols: ^VIX, ^TNX, SPY, QQQ, IWM, sector/theme ETFs into `price_daily`); `refresh-filings` (SEC EDGAR filings + Form 4 insider transactions; deploy version 3); `/api/cron` runs market (22:00 UTC Mon–Fri), stocks (23:00 UTC Mon–Fri), filings (10:00 UTC daily), each logged to `refresh_runs`; `/api/price-history` proxies Yahoo v8 chart |
| Charts | Recharts | Price chart on stock detail; sector x market-cap heat map on dashboard |

---

## 5. Scoring Dimensions Status

The scope document specifies 8 dimensions. Scoring model v2 (`src/lib/scoring/model.ts`, 2026-10-15) defines all 8 at the document weights. Model v2.1 (2026-10-16, `src/lib/scoring/regime.ts`) adds Market Regime Fit, so all 8 are scored; when a stock has no `regime_fit_score` yet, that weight is re-normalized across the other dimensions. The "What's needed" column lists only the data depth still missing.

| # | Document dimension | Weight | Status | Current implementation (v2 inputs) | What's needed |
|---|---|---:|---|---|---|
| 1 | Growth Potential | 18% | - [x] Implemented (v2) | Single dimension: revenue growth YoY (60%) + earnings growth YoY (40%), plus up to +10 for R&D intensity | Forward revenue/EPS estimates, multi-year growth history |
| 2 | Valuation Upside | 13% | - [x] Implemented (v2) | Mean of forward P/E, growth-adjusted P/S, PEG and analyst mean-target upside vs current price | EV/Sales, peer/sector-relative comparison |
| 3 | Momentum | 13% | - [x] Implemented (v2) | Momentum score (MA5/MA20 + 20-day return, 70%) + position in 52-week range (30%) | Estimate revisions, earnings surprises, relative strength vs sector, volume trends, short interest |
| 4 | Fundamental Quality | 10% | - [x] Implemented (v2) | Gross/operating/net margins, debt-to-equity, cash runway | FCF margin, ROIC, share-dilution tracking |
| 5 | Catalyst Strength | 10% | - [x] Implemented (v2, proxy) | Proxy from pipeline count (60%) + R&D intensity (40%); no dated events | Catalyst calendar table: earnings dates, product launches, regulatory events |
| 6 | Market Position | 5% | - [x] Implemented (v2) | Market-cap tier, gross margin as pricing-power indicator, average volume (liquidity) | Market share, moat indicators, customer concentration |
| 7 | Risk & Volatility | 6% | - [x] Implemented (v2) | Opportunity-side asymmetry from volatility + beta. Separate independent 0-100 risk score with label, drivers and invalidation signals in `src/lib/scoring/risk.ts` (volatility, beta, leverage, runway, market cap, profitability) | Drawdown history, liquidity/float risk inputs |
| 8 | Market Regime Fit | 5% | - [x] Implemented (v2.1) | Daily `market_regime_snapshots` from `refresh-market` closes: VIX, 10y yield (^TNX) and its 63-day change, SPY vs 200-day MA, SPY 63-day return, risk-appetite 0–100 and label (risk_on / neutral / risk_off), sector/theme ETF 63-day strength vs SPY. Per-stock `regime_fit_score` + drivers from sector-ETF relative strength and style fit (beta, revenue/earnings growth, profitability, volatility) vs the regime label | FRED macro series (CPI, GDP, liquidity), credit spreads, regime backtest validation |
| 9 | Room to 3x (added v2.2) | 20% | - [x] Implemented (v2.2) | Log market cap ($1B=100, $1T=0, 40%), analyst mean target multiple (1x-3x, 35%) and high target multiple (1x-4x, 25%); targets ignored with fewer than 3 analysts | Historical analyst targets for the track-record backfill (it scores size only) |

**Tested and not added (2026-10-26): Smart Money.** Specialist-fund ownership (13F) and C-suite buying (Form 4) made Top N worse on the fair point-in-time test, so it stays display-only and the model stays v2.2. See section 15.

**Non-standard dimension removed (model v2):** "Innovation & Pipeline" (15pts) — not in the document's framework. R&D ratio and pipeline count can feed into Growth Potential and Catalyst Strength instead.

---

## 6. Feature Status

Features from scope document sections 8.1–8.7.

### 8.1 Discovery and ranking
- [x] Ranked grid of curated stocks (sorted by score)
- [x] Basic filters: search, sector, risk level
- [x] Sort by: score, revenue growth, momentum, volatility, market cap
- [ ] Top 10 / Top 25 / Top 100 opportunity lists
- [ ] Filters by: industry, market cap bucket, price, liquidity, profitability, catalyst date
- [x] Preset screens (highest 3x, best risk-adjusted, highest momentum, most undervalued, new score breakouts, oversold quality, profitable compounders, lower risk)
- [ ] "Catalysts imminent" preset (catalysts table now exists; preset not built yet)
- [x] Score-change leaderboard
- [x] Sector and market-cap heat maps (dashboard)
- [ ] Saved custom screens

### 8.2 Stock detail page
- [x] 3x Opportunity Score and risk badge
- [x] One-sentence investment thesis
- [x] Dimension score breakdown (all 8 dimensions scored as of v2.1; Market Regime Fit shows "not scored yet" until the daily refresh writes a fit)
- [x] Key catalysts list
- [x] Key risks list
- [x] Basic metrics table
- [x] Dedicated page at `/stock/:ticker` (replaces modal)
- [ ] Price, market cap, volume, and liquidity summary
- [x] Bull case, bear case, and neutral case
- [x] Catalyst calendar (stock panel + `/catalysts` page)
- [ ] Valuation versus peers
- [ ] Financial trend charts
- [x] Price chart (Recharts, `/api/price-history`)
- [ ] Earnings, news, and score-change markers on the price chart
- [ ] Analyst estimates and revisions
- [~] Insider activity (Form 4 transactions, `SecActivityPanel` insider tab via `/api/filings`; `SecActivityPanel` mounted on stock detail; Form 4 marker migration `20261016173437_sec_form4_processed.sql`) — short interest still missing
- [~] SEC filings (`SecActivityPanel` filings tab, EDGAR links; `SecActivityPanel` mounted on stock detail; `refresh-filings` source in `supabase/functions/refresh-filings`) — news still missing
- [x] 3x scenario calculator
- [x] Smart money panel: specialist biotech/healthcare fund holders (13F) with quarter-over-quarter change, and C-suite open-market buys ($25k+, last 90 days), with the 45-day 13F lag stated (`SmartMoneyPanel`, `/api/smart-money`). Display only, not scored
- [ ] Thesis invalidation signals
- [x] Historical score trend

### 8.3 3x scenario calculator
- [x] Started: pure engine in `src/lib/scenario` (scenario set, sanity flags, sensitivity table) + calculator card on stock detail
- [ ] Saved scenarios (`scenario_calculations` table)

### 8.4 Watchlists and simulated portfolios
- [x] Basic watchlist (add/remove stocks, single shared list)
- [x] Per-user watchlists for signed-in users (owner_id + RLS); anonymous shared lists preserved
- [x] Named watchlists (multiple lists)
- [x] Notes and tags per stock
- [x] Score change tracking per watchlist
- [x] Aggregate risk and sector exposure view (portfolio exposure in `src/lib/portfolio`, Portfolios page routed at `/app/portfolios`)
- [ ] Sort watchlist by score, risk, catalyst date, price change, valuation
- [x] Simulated portfolios (positions, cost basis, unrealized gains; `portfolios`/`positions` tables, `/api/portfolios`, `/api/positions`, Portfolios page routed at `/app/portfolios`)
- [x] Portfolio exposure analysis (sector, risk-level and concentration exposure)
- [ ] Thesis-health alerts

### 8.5 Alerts
- [x] Per-user alert rules (`alerts` table, `/api/alerts` CRUD) with throttled evaluation when `/api/alert-events` is read
- [x] Alert events inbox (`alert_events`, `/api/alert-events`), Alerts page (`/app/alerts`) and notification bell wired
- [ ] Email / push delivery (in-app only)

### 8.6 Backtesting and model validation
- [x] Score forward-return backtest: SQL function `score_forward_returns` over `score_history` + `price_daily`, pure aggregation engine (`src/lib/backtest`), `GET /api/backtest`
- [x] Backtest page with sample size, score-bucket chart/table, stats and caveats: routed at `/app/backtest`
- [ ] Meaningful sample: forward returns need weeks of stored daily history before results carry weight
- [x] Data quality: `refresh_runs` log + on-demand checks (`src/lib/data-quality`, `/api/data-health`, Data health page routed at `/app/data-health`)

### 8.7 AI research assistant
- [ ] Not started

---

## 7. Data Coverage

Data categories from scope document section 6.

| Category | Status | What we have | What's needed |
|---|---|---|---|
| Security master | - [ ] Partial | ticker, company name, sector, market cap, price | exchange, currency, country, asset type, industry, sub-industry, float, shares outstanding, CIK/FIGI/ISIN |
| Price and volume | - [x] Stored daily | Daily OHLCV bars stored in `price_daily` for the universe (`refresh-stocks` v6) and regime symbols (`refresh-market`), refreshed by Vercel cron | Adjusted prices, corporate actions, intraday data, real-time quotes |
| Fundamentals | - [ ] Partial | revenue growth, earnings growth, debt-to-equity, cash runway | Income statement, balance sheet, cash flow, margins, ROIC, dilution, SBC |
| Estimates and analyst | - [ ] Missing | Nothing | Forward EPS/revenue, revisions, price targets, ratings, earnings calendar |
| Alternative data | - [ ] Partial | SEC EDGAR filings (`sec_filings`) and Form 4 insider transactions (`insider_transactions`) via `refresh-filings`; specialist healthcare fund 13F holdings for 41 managers (`smart_money_*`) via `refresh-smart-money` | News, transcripts, broad institutional ownership, short interest, options data |
| Macro data | - [ ] Partial | VIX, 10y yield, SPY trend, sector/theme ETF strength, derived risk appetite (`market_regime_snapshots`) | CPI, GDP, liquidity, credit spreads (FRED) |

---

## 8. Database Tables Status

Scope document section 13 recommends ~30+ tables. We have 17 live (see section 14 for migration status).

### Current tables
- [x] `stocks` — stock metrics and scores
- [x] `watchlist` — simple watchlist (ticker + added_at)
- [x] `score_history` — historical score snapshots (migration 20261015191519)
- [x] `watchlists` — named watchlists (migration 20261015191530)
- [x] `watchlist_items` — per-list items with notes and tags (migration 20261015191530)
- [x] `catalysts` — dated events per stock: Yahoo earnings ingest + manual entries (migration 20261015220504)
- [x] `price_daily` — stored daily OHLCV (migration 20261016164051)
- [x] `market_regime_snapshots` — daily regime snapshot (migration 20261016164051)
- [x] `refresh_runs` — refresh/cron run log used by data-health (migration 20261016164051)
- [x] `sec_sync_state`, `sec_filings`, `insider_transactions` — SEC EDGAR data (migration 20261016164112)
- [x] `sec_form4_processed` — processed Form 4 markers (live version 20261016173437)
- [x] `alerts`, `alert_events` — per-user alert rules and fired events (migration 20261016164150)
- [x] `portfolios`, `positions` — simulated portfolios (migration 20261016164150)
- [x] `smart_money_managers`, `smart_money_filings`, `smart_money_holdings`, `cusip_tickers`, `smart_money_signals` — specialist fund 13F holdings and per-ticker summary (migration 20261026120000)

### Phase 1 target tables
- [x] `score_history` — historical score snapshots for tracking changes
- [x] `catalysts` — upcoming events per stock
- [x] `price_daily` — stored daily OHLCV (instead of on-demand fetch)

### Full document table list (Phase 2+)
- [ ] `users`
- [ ] `subscriptions`
- [ ] `user_preferences`
- [x] `watchlists` (named; per-user ownership via `owner_id` + RLS, migration 20261015220517)
- [x] `watchlist_items`
- [x] `alerts`
- [x] `alert_events`
- [x] `portfolios`
- [x] `positions`
- [ ] `research_notes`
- [ ] `tags`
- [ ] `audit_logs`
- [ ] `securities` (expanded master)
- [ ] `price_intraday`
- [ ] `corporate_actions`
- [ ] `market_snapshots`
- [ ] `technical_indicators`
- [ ] `macro_indicators` (partial substitute: `market_regime_snapshots`)
- [ ] `fundamentals_quarterly`
- [ ] `fundamentals_annual`
- [ ] `analyst_estimates`
- [ ] `estimate_revisions`
- [ ] `price_targets`
- [ ] `earnings_events`
- [ ] `earnings_transcripts`
- [ ] `news_items`
- [x] `filings` (implemented as `sec_filings`)
- [x] `insider_transactions`
- [ ] `institutional_holdings`
- [ ] `short_interest`
- [ ] `options_metrics`
- [ ] `score_runs`
- [ ] `dimension_scores`
- [ ] `risk_assessments`
- [ ] `model_versions`
- [ ] `model_weights`
- [x] `backtests` (computed on demand by SQL function `score_forward_returns`; no stored table)
- [ ] `backtest_results`
- [ ] `scenario_calculations`
- [x] `data_quality_checks` (implemented as `refresh_runs` log + on-demand checks in `/api/data-health`; no dedicated table)

---

## 9. Roadmap — Low-Hanging Fruit

These items need no new external data or infrastructure. Mostly frontend, schema, or logic changes.

| # | Item | Status | Effort | Notes |
|---|---|---|---|---|
| 1 | Multi-page navigation and layout shell | - [x] | Medium | Shipped: react-router shell, NavBar/Footer, Dashboard/Explore/Detail/Watchlists/Methodology pages, SPA rewrite |
| 2 | Dedicated stock detail page (replace modal) | - [x] | Small | Shipped: `/stock/:ticker` full page replaces modal |
| 3 | Expand scoring from 6 to 8 dimensions | - [x] | Medium | Shipped: scoring model v2 with 8 document dimensions and weights (7 scored; Market Regime Fit waits on macro data); Innovation & Pipeline removed |
| 4 | Independent risk score (0–100) | - [x] | Small | Shipped: independent 0–100 risk score from existing fields |
| 5 | Bull case / bear case / neutral case | - [x] | Small | Shipped: structured bull/bear/neutral cases on detail page |
| 6 | Preset screens | - [x] | Small | Shipped: preset screens on Explore (highest 3x, best risk-adjusted, most undervalued, etc.) |
| 7 | Named watchlists with notes and tags | - [x] | Medium | Shipped: watchlists + watchlist_items tables, `/api/watchlists` and `/api/watchlist-items`, Watchlists page with notes/tags |
| 8 | Score-change tracking | - [x] | Small | Shipped: score_history table, `/api/score-history`, deltas on cards and detail page; refresh rescoring writes history |
| 9 | Expand stock universe (24 → 100+) | - [x] | Small | Shipped: seed expanded to 137 tickers (migration 20261015192133) |
| 10 | Disclaimer and compliance text | - [x] | Small | Shipped: Methodology page, disclaimers in footer, data-source attribution |

## 10. Roadmap — Medium Difficulty

Need some new data or infrastructure, but achievable without paid services.

| # | Item | Status | Effort | Notes |
|---|---|---|---|---|
| 11 | Price charts on stock detail pages | - [x] | Medium | Shipped: `/api/price-history` proxies Yahoo v8 chart; Recharts price chart on stock detail |
| 12 | Catalyst calendar | - [x] | Medium | Shipped: `catalysts` table, Yahoo earnings ingest in `refresh-stocks` v5, manual entries by signed-in users (`/api/catalysts`), `/catalysts` page |
| 13 | 3x scenario calculator | - [x] | Medium | Shipped: engine in `src/lib/scenario` (sanity flags, sensitivity table) + calculator UI on stock detail |
| 14 | User accounts and authentication | - [x] | Medium | Shipped: Supabase Auth email/password; per-user watchlists via `owner_id` + RLS; anonymous shared lists preserved |
| 15 | Sector and market-cap heat maps | - [x] | Medium | Shipped: sector x market-cap heat map on dashboard |

## 11. Roadmap — Tough Items

Require significant new data, infrastructure, or complexity.

Stage C status: `app-wiring` is merged on `swarm/integration`. `src/App.tsx` routes the Market regime, Alerts, Portfolios, Data health and Backtest pages; `RegimeSummaryCard` is on the dashboard, `NotificationBell` in the app header and `SecActivityPanel` on stock detail. `backtest-ui` landed through `app-wiring`; the `refresh-filings` source and Form 4 marker migration from `edge-sec-filings` are on `swarm/integration`.

| # | Item | Status | Effort | Notes |
|---|---|---|---|---|
| 16 | Full fundamental data ingestion | - [ ] | Hard | Paid data vendor needed (Alpha Vantage, Polygon, FMP) |
| 17 | Analyst estimates and revisions | - [ ] | Hard | Paid data feed required |
| 18 | News, SEC filings, transcripts | - [~] Partial | Hard | SEC filings built: `refresh-filings` (free SEC EDGAR, needs `SEC_USER_AGENT`; source in `supabase/functions/refresh-filings`, deployed v3), `sec_filings`, `/api/filings`; `SecActivityPanel` mounted on stock detail. News and transcripts still missing |
| 19 | Insider activity, institutional ownership, short interest | - [~] Partial | Hard | Insider activity built: Form 4 parsing into `insider_transactions` (processed markers in `sec_form4_processed`); `SecActivityPanel` mounted on stock detail. Institutional ownership and short interest still missing |
| 20 | Options data | - [ ] | Hard | Specialized, often expensive data source |
| 21 | Macro and market regime data | - [x] | Hard | Backend shipped: `refresh-market` + `market_regime_snapshots`, regime model v2.1, Market Regime Fit scored. Market regime page (`/app/market`) and dashboard card wired. FRED series not yet ingested |
| 22 | Backtesting engine | - [x] | Hard | Shipped: `score_forward_returns` SQL function, `src/lib/backtest` engine, `/api/backtest`, Backtest page routed at `/app/backtest`. Results thin until daily history accumulates |
| 23 | Alert system | - [x] | Hard | Backend shipped: `alerts`/`alert_events`, throttled evaluation on inbox read, `/api/alerts`, `/api/alert-events`. Alerts page (`/app/alerts`) and bell wired. In-app delivery only |
| 24 | AI research assistant | - [ ] | Hard | Needs underlying data first, plus retrieval system and guardrails |
| 25 | Simulated portfolios | - [x] | Hard | Backend shipped: `portfolios`/`positions`, `/api/portfolios`, `/api/positions`. Portfolios page with P&L and exposure routed at `/app/portfolios` (prices from latest refresh, not real-time) |
| 26 | Mobile app (React Native / Flutter) | - [ ] | Hard | Entirely separate codebase |
| 27 | Time-series storage architecture | - [x] | Hard | Shipped: `price_daily` written by `refresh-stocks` v6 and `refresh-market`, refreshed by Vercel daily crons |
| 28 | Data-quality checks and monitoring | - [x] | Hard | Backend shipped: `refresh_runs` log, on-demand checks (`src/lib/data-quality`, `/api/data-health`). Data health page routed at `/app/data-health`. No paging/alerting on failures |

---

## 12. Build Log

Running log of what was done in each build session.

### Session 1 — 2026-10-12 (initial build)
- Created Supabase migration: `stocks` and `watchlist` tables with RLS
- Seeded 24 stocks across biotech, tech, AI, clean energy, fintech, aerospace, quantum sectors
- Built edge function `refresh-stocks` to fetch live prices, momentum, volatility from Yahoo Finance
- Created UI components: StatsOverview, StockDetailModal, full Radix UI primitive set
- Built analysis engine with 6-dimension scoring (Revenue Growth, Earnings Growth, Momentum, Innovation & Pipeline, Financial Health, Volatility)
- Single-page app with header, hero, stats overview, filters, stock grid, detail modal
- Watchlist add/remove functionality

### Session 2 — 2026-10-14
- Created PROGRESS.md tracking document
- Assessed current state against full scope document
- Identified low-hanging fruit, medium, and tough roadmap items
- Documented design and architecture standards

### Session 3 — 2026-10-15 (Stage A swarm build)
Roadmap items 1–10 built by the engineering swarm (`roadmap-swarm` workflow), one worktree per package on `swarm/<id>`, merged via wave branches.
- Wave 1: `router-deps-spa-rewrite` (react-router-dom v6 + `vercel.json` SPA rewrite excluding `/api/`), `schema-contracts` (scoring inputs, score_history, named watchlists, shared types), `universe-seed-100` (137 tickers), `edge-refresh-v2` (bounded concurrency, crumb auth, v7 fallback, expanded fields, schema degrade)
- Wave 2: `scoring-model-v2` (8 dimensions, independent risk score, bull/bear/neutral cases, preset screens), `api-v2` (score history + named watchlist endpoints with graceful DB degradation), `app-shell-routing` (routed shell, StocksProvider, StockCard, pages)
- Wave 3: `dashboard`, `explore-presets`, `stock-detail-page`, `watchlists-page`, `methodology-compliance`, `refresh-rescore`, `progress-doc-stage-a`
- Earlier same day: fixed ESM `.js` import paths in Vercel API routes (prod `ERR_MODULE_NOT_FOUND`); added swarm agents and CLAUDE.md

### Session 4 — 2026-10-15 (Stage B swarm build)
Roadmap items 11–15 built by the engineering swarm (`roadmap-swarm` workflow), one worktree per package on `swarm/<id>`, merged via `swarm/wave-1` and `swarm/wave-2`.
- Wave 1: `db-catalysts-watchlist-ownership` (catalysts table, `watchlists.owner_id` + per-owner RLS), `api-contracts` (catalyst/price-history types, auth-aware API client, server auth helpers), `scenario-engine` (pure 3x scenario engine, sanity flags, sensitivity table), `sector-cap-heatmap` (dashboard heat map), `recharts-and-public-env` (recharts@2.15.4, public `VITE_` env)
- Wave 2: `api-price-history` (Yahoo v8 chart proxy), `api-catalysts` (GET list, POST manual, DELETE own), `api-watchlists-per-user` (watchlists scoped via resolveAuth), `edge-refresh-catalysts` (refresh-stocks v5 earnings ingest), `price-chart-ui`, `catalysts-ui` (calendar page, stock panel, add dialog), `scenario-calculator-ui`, `auth-ui` (supabase-js auth only, AuthProvider, AccountMenu, LoginPage)
- Wave 3: `progress-doc-stage-b`

### Session 5 — 2026-10-16 (Stage C swarm build)
Roadmap items 21, 22, 23, 25, 27, 28 (plus partial 18 and 19) built by the engineering swarm (`roadmap-swarm` workflow), one worktree per package on `swarm/<id>`, merged via `swarm/wave-1` and `swarm/wave-2`.
- Wave 1: `db-stage-c-schema` (four Stage C migrations), `stage-c-contracts` (shared types + API client), `regime-scoring-v2-1` (regime snapshot + per-stock fit), `backtest-engine` (pure aggregation), `portfolio-alerts-dq-libs` (pure portfolio, alerts, data-quality libs)
- Wave 2: `edge-prices-market` (`refresh-stocks` v6 + `refresh-market`), `edge-sec-filings` (`refresh-filings`), `api-refresh-regime-cron` (refresh core, `/api/cron`, `/api/market-regime`), `api-alerts`, `api-portfolios`, `api-backtest`, `api-filings-data-health`, `vercel-cron`, `alerts-ui`, `portfolios-ui`, `market-regime-ui`, `data-health-ui`, `filings-ui`, `backtest-ui`
- Wave 3: `app-wiring`, `marketing-methodology-beta-copy`, `progress-doc-stage-c`
- Note: `backtest-ui` landed through `app-wiring`; the `edge-sec-filings` function source and marker migration were reconciled onto `swarm/integration` (`refresh-filings` deployed, version 3)

### Session 6 — 2026-10-26 (Smart Money)
- Fixed list of 41 specialist biotech/healthcare 13F filers (Baker Bros, RA Capital, Perceptive, Deerfield, EcoR1, Avoro, Cormorant, BVF, OrbiMed, RTW...). Generalists with a healthcare book (Farallon, Viking, Adage) are left out because their 13F cannot be split by sector
- Migration `20261026120000_smart_money.sql`, edge function `refresh-smart-money` (13F info tables, OpenFIGI CUSIP map, per-ticker signals), `/api/cron?job=smart-money` daily 10:30 UTC, `/api/smart-money`, `SmartMoneyPanel` on stock detail
- Point-in-time backtest (`scripts/smart-money`) through a new `TR_SCORE_HOOK` in `scripts/track-record/compute.ts`; the signal hurt Top N, so no model v2.3 (section 15)
- Track-record prices: the `history-backfill` edge function is retired, so `scripts/track-record/prices-local.mjs` fetches from Yahoo directly

---

## 13. Environment

- **Supabase URL:** configured in `.env` (project: irbwaucilrznbqynhtmr)
- **Supabase Anon Key:** configured in `.env`
- **Edge functions deployed:** `refresh-stocks` v6 code (Supabase version 7: Yahoo refresh, earnings ingest, `price_daily` bars), `refresh-market` (version 1), `refresh-filings` (version 3), `refresh-smart-money` (version 2, 2026-10-26)
- **Edge Function secrets:** `SEC_USER_AGENT` (required by `refresh-filings`; SEC EDGAR rejects requests without a contact user agent), optional `REFRESH_FILINGS_SECRET` (gates forced re-sync)
- **Vercel cron:** `CRON_SECRET` env var authenticates `/api/cron`. Schedule (UTC, `vercel.json`): `job=market` 22:00 Mon–Fri, `job=stocks` 23:00 Mon–Fri, `job=filings` 10:00 daily, `job=smart-money` 10:30 daily. `api/cron.ts` and `api/refresh.ts` have `maxDuration` 120
- **Git:** repository on GitHub; commits must be authored as `yashgaddam05@gmail.com` or Vercel skips the build
- **Vercel:** project `stockanalyzer` in team scope `bolot1`; pushing to `main` deploys to production. Env vars (`DATABASE_URL`, `DATABASE_ANON_KEY`, and the new public `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are Production-only, so preview deploys 500 until they are added to Preview
- **Browser Supabase access:** `supabase-js` in the browser is used for Auth only (`src/lib/auth-client.ts`); all data goes through `/api/*`
- **Swarm branches:** work lands on `swarm/integration`, never directly on `main`

---

## 14. Unapplied Migrations / Pending Ops

All three migrations confirmed applied to production Supabase (irbwaucilrznbqynhtmr) on 2026-10-15; local filenames match live versions.
- [x] `supabase/migrations/20261015191519_scoring_inputs_and_score_history.sql` — scoring input columns + `score_history`
- [x] `supabase/migrations/20261015191530_named_watchlists.sql` — `watchlists`, `watchlist_items`
- [x] `supabase/migrations/20261015192133_expand_universe_seed.sql` — expand seed to 137 tickers
- [x] Redeploy `refresh-stocks` edge function (v2 refresh + rescoring) and run one refresh

Stage B (session 4) migrations, applied to production Supabase; local filenames match live versions:
- [x] `supabase/migrations/20261015220504_catalysts.sql` — `catalysts` table (live version 20261015220504)
- [x] `supabase/migrations/20261015220517_watchlist_ownership.sql` — `watchlists.owner_id`, per-owner default index, per-owner RLS (live version 20261015220517)
- [x] `refresh-stocks` edge function v5 deployed (earnings-date ingest into catalysts)
- [ ] Wire Stage B UI on `swarm/wave-2`: `/catalysts` and `/login` routes are not yet registered in `src/App.tsx`; `PriceChart`, `CatalystPanel`, `ScenarioCalculator` are not yet mounted in `StockDetailPage`; `AccountMenu` is not yet in `NavBar`
- [ ] **Owner action:** set Supabase Auth Site URL and redirect URLs to the production domain (Dashboard > Authentication > URL Configuration) so email confirmation / login links resolve
- [ ] Post-deploy smoke test: `/`, `/api/stocks`, `/api/watchlist`, `/api/watchlists`, `/api/score-history`, `/api/price-history`, `/api/catalysts`, `/catalysts`, `/login` return 200 + sane JSON / page

Stage C (session 5) migrations, applied to production Supabase; local filenames match live versions:
- [x] `supabase/migrations/20261016164051_stage_c_market_data.sql` — `price_daily`, `market_regime_snapshots`, `refresh_runs`, `stocks.regime_fit_score` / `regime_fit_drivers` (live version 20261016164051)
- [x] `supabase/migrations/20261016164112_stage_c_sec_edgar.sql` — `sec_sync_state`, `sec_filings`, `insider_transactions` (live version 20261016164112)
- [x] `supabase/migrations/20261016164150_stage_c_alerts_portfolios.sql` — `alerts`, `alert_events`, `portfolios`, `positions` (live version 20261016164150)
- [x] `supabase/migrations/20261016164221_stage_c_backtest_fn.sql` — `score_forward_returns` SQL function (live version 20261016164221)
- [x] `supabase/migrations/20261016173437_sec_form4_processed.sql` — `sec_form4_processed` + sentinel backfill (live version 20261016173437; renamed from `20261016180000` on `swarm/edge-sec-filings`)
- [ ] `20261016180100_drop_insider_sentinels.sql` (DELETE of legacy `line_no < 0` rows) stays on `swarm/edge-sec-filings`, not applied and not on `swarm/integration`; needs review before it ships. Readers filter `line_no >= 0` meanwhile
- [x] Edge functions deployed: `refresh-stocks` (version 7), `refresh-market` (version 1), `refresh-filings` (version 3)
- [x] `backtest-ui` merged and Stage C routes plus `SecActivityPanel` wired (`app-wiring`); `refresh-filings` source on `swarm/integration`
- [ ] **Owner action:** turn on leaked-password protection (Supabase Dashboard > Authentication > Password security / Attack protection); it is the only `get_advisors` security WARN (`auth_leaked_password_protection`) and is a project Auth setting, not a schema issue
- [ ] **Owner action:** set the `SEC_USER_AGENT` Edge Function secret (Supabase Dashboard > Edge Functions > Secrets) if not already set, e.g. `3x Hunter contact@yourdomain`
- [ ] **Owner action:** set `CRON_SECRET` in Vercel Production env if not set, then confirm the three cron jobs run in the Vercel dashboard (Settings > Cron Jobs) and that `refresh_runs` gets rows
- [ ] Post-deploy smoke test: `/api/market-regime`, `/api/alerts`, `/api/alert-events`, `/api/portfolios`, `/api/positions`, `/api/backtest`, `/api/filings`, `/api/data-health` return 200 + sane JSON

Smart Money (session 6), applied 2026-10-26:
- [x] `supabase/migrations/20261026120000_smart_money.sql` applied (live as `smart_money`; `smart_money_holdings` was recreated once with the `cik` key column before any data, so the live table matches the file)
- [x] `refresh-smart-money` deployed (version 2) and run once: 41 managers, 128 filings (Q4 2025 to Q2 2026), 7,587 positions, 571 ticker signals. The 44 older filings in its 400-day window load on the next daily runs
- [x] `cusip_tickers` seeded with the 387 CUSIPs that map to universe tickers; other CUSIPs are mapped through OpenFIGI at 120 per run
- [ ] **Owner action:** `vercel.json` adds the `job=smart-money` cron; confirm it shows under Settings > Cron Jobs after deploy
- [ ] `SEC_USER_AGENT` secret is still unset (the run reported `user_agent_source: fallback`); same owner action as above

---

## 15. Smart Money backtest (2026-10-26)

**Question:** does specialist biotech/healthcare fund ownership (and C-suite buying) improve the 3x model's Top N picks? Research reported secondhand from Verdad Capital (2026) says the most specialist-owned biotech stocks returned about 20%/yr vs about -2% for the least-owned.

**Method (same fair rules as the track record):** quarterly rebalance 2016-01 to 2026-10 (44 quarters), only point-in-time S&P 500 members, scores from data known before the rebalance day. Each 13F counts from its SEC filing date, not quarter end (45-day lag), and only the first original filing per period (no later amendments). 1,607 13F-HR filings from 41 managers (2015 to 2026), CUSIPs mapped with OpenFIGI. Insider buys come from SEC Form 345 data sets through 2026-Q1: C-suite titles only, $25k+ per purchase, filed before the rebalance day, traded in the prior 90 days. Code: `scripts/smart-money/` (README there).

**1. Signal alone, next-quarter equal-weight returns**

| Test (S&P members on the day) | Group A | Group B | A ann. | B ann. | Spread / quarter | t-stat | A beats B |
|---|---|---|---:|---:|---:|---:|---:|
| Health care: most vs least specialist-owned third | ~16 names | ~16 names | 9.9% | 13.6% | -0.89 pts | -1.16 | 43% |
| Health care: 3+ specialist holders vs none | ~12 | ~18 | 8.4% | 13.2% | -1.16 pts | -1.33 | 41% |
| Health care: holders rose vs fell q/q | ~10 | ~11 | 15.2% | 12.9% | +0.65 pts | 0.57 | 50% |
| All sectors: C-suite buy vs none | ~14 | ~388 | 18.8% | 15.1% | +0.92 pts | 1.16 | 52% |
| Health care: C-suite buy vs none | ~2 | ~49 | 29.1% | 11.1% | +4.85 pts | 1.93 | 61% |

With hindsight bias (all health care incl. today's curated biotech names): most vs least owned +0.12 pts/quarter (t 0.10).

**2. Candidate dimension in the model.** v2.2 plus a Smart Money dimension (holders 0-6 scaled, optionally Q/Q holder change and C-suite buys), added at weight 8 or 15 through `TR_SCORE_HOOK`. Weight 0 reproduces v2.2 exactly (harness check).

| Model | Top 10 CAGR / Sharpe | Top 20 CAGR / Sharpe | Top 50 CAGR / Sharpe |
|---|---|---|---|
| **v2.2 (current)** | **25.9% / 1.38** | **22.6% / 1.28** | **19.4% / 1.17** |
| + holders, w8 | 26.0% / 1.34 | 21.4% / 1.22 | 19.3% / 1.16 |
| + holders, w15 | 25.0% / 1.29 | 20.2% / 1.14 | 18.8% / 1.13 |
| + holders + Q/Q, w8 | 26.0% / 1.35 | 21.3% / 1.20 | 19.5% / 1.17 |
| + holders + Q/Q, w15 | 24.9% / 1.29 | 21.3% / 1.19 | 19.0% / 1.14 |
| + holders + Q/Q + C-suite buys, w8 | 25.3% / 1.34 | 21.1% / 1.18 | 19.5% / 1.20 |
| + holders + Q/Q + C-suite buys, w15 | 25.6% / 1.37 | 21.3% / 1.24 | 18.7% / 1.15 |

**Decision: display-only, no v2.3.** Every variant lowers Top 20 by 1.3 to 2.4 points a year, and none beats v2.2 on Top 10 Sharpe. Top 10 CAGR moves by +0.1 at most, which is noise.

**Why it fails here when the paper finds an edge:** the fair test only allows S&P 500 members, about 50 large-cap health care names a quarter. The specialist-fund effect lives in small and mid-cap biotech, which the S&P rule excludes. Among large caps, specialist ownership tilted toward names that lagged. The C-suite buy signal points the right way (+0.9 pts/quarter across all S&P members) but is not significant (t 1.2), and in health care it rests on about 2 names a quarter.

**Revisit when:** the universe gets a fair point-in-time small/mid-cap biotech set (e.g. historical XBI or Russell 2000 health care membership). That is where this signal should be tested next. The insider-buy signal could also be retested on its own once the 2026 Q2+ Form 345 data sets are out.

