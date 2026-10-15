# 3x Hunter — Project Progress Tracker

**Last updated:** 2026-10-15
**Current phase:** Phase 1 MVP (subset) — Stage A (roadmap items 1–10) and Stage B (items 11–15) built; ~70% complete
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
| Phase | Phase 1 MVP subset | Stage A (items 1–10) complete; Stage B (items 11–15) built |
| Stock universe | 100+ stocks seeded (137 tickers) | Document targets 200–500 |
| Scoring dimensions | 8 of 8 | Aligned to document weights; Innovation & Pipeline removed (model v2) |
| Risk model | Independent 0–100 risk score | Computed from volatility, beta, debt-to-equity, cash runway, market cap |
| UX | Multi-page routing | react-router: Dashboard, Explore, Stock Detail, Watchlists, Methodology; SPA rewrite excludes `/api/` |
| User accounts | Supabase Auth (email/password) | Per-user watchlists via `watchlists.owner_id` + RLS; anonymous shared lists (owner_id NULL) preserved |
| Database tables | 6 of ~30+ | stocks, watchlist, watchlists, watchlist_items, score_history, catalysts |
| Data pipeline | 1 edge function + Vercel `/api/*` routes | Yahoo Finance free endpoints; `refresh-stocks` v5 (bounded-concurrency refresh, rescoring, earnings-date ingest into catalysts); `/api/price-history` proxies Yahoo v8 chart |
| Charts | Recharts | Price chart on stock detail; sector x market-cap heat map on dashboard |

---

## 5. Scoring Dimensions Status

The scope document specifies 8 dimensions. Scoring model v2 (`src/lib/scoring/model.ts`, 2026-10-15) defines all 8 at the document weights and scores 7 of them from available free data. Market Regime Fit returns null until macro data exists, and its weight is re-normalized across the other dimensions. The "What's needed" column lists only the data depth still missing.

| # | Document dimension | Weight | Status | Current implementation (v2 inputs) | What's needed |
|---|---|---:|---|---|---|
| 1 | Growth Potential | 20% | - [x] Implemented (v2) | Single dimension: revenue growth YoY (60%) + earnings growth YoY (40%), plus up to +10 for R&D intensity | Forward revenue/EPS estimates, multi-year growth history |
| 2 | Valuation Upside | 18% | - [x] Implemented (v2) | Mean of forward P/E, growth-adjusted P/S, PEG and analyst mean-target upside vs current price | EV/Sales, peer/sector-relative comparison |
| 3 | Momentum | 15% | - [x] Implemented (v2) | Momentum score (MA5/MA20 + 20-day return, 70%) + position in 52-week range (30%) | Estimate revisions, earnings surprises, relative strength vs sector, volume trends, short interest |
| 4 | Fundamental Quality | 12% | - [x] Implemented (v2) | Gross/operating/net margins, debt-to-equity, cash runway | FCF margin, ROIC, share-dilution tracking |
| 5 | Catalyst Strength | 12% | - [x] Implemented (v2, proxy) | Proxy from pipeline count (60%) + R&D intensity (40%); no dated events | Catalyst calendar table: earnings dates, product launches, regulatory events |
| 6 | Market Position | 10% | - [x] Implemented (v2) | Market-cap tier, gross margin as pricing-power indicator, average volume (liquidity) | Market share, moat indicators, customer concentration |
| 7 | Risk & Volatility | 8% | - [x] Implemented (v2) | Opportunity-side asymmetry from volatility + beta. Separate independent 0-100 risk score with label, drivers and invalidation signals in `src/lib/scoring/risk.ts` (volatility, beta, leverage, runway, market cap, profitability) | Drawdown history, liquidity/float risk inputs |
| 8 | Market Regime Fit | 5% | - [ ] Defined, not scored | Weight defined; scorer returns null and the weight is re-normalized | Macro indicators, rate trends, sector rotation, growth vs value (roadmap item 21) |

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
- [x] Dimension score breakdown (all 8 dimensions shown; Market Regime Fit shows "not scored")
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
- [ ] Short interest and insider activity
- [ ] News and SEC filings
- [x] 3x scenario calculator
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
- [ ] Aggregate risk and sector exposure view
- [ ] Sort watchlist by score, risk, catalyst date, price change, valuation
- [ ] Simulated portfolios (positions, cost basis, unrealized gains)
- [ ] Portfolio exposure analysis
- [ ] Thesis-health alerts

### 8.5 Alerts
- [ ] Not started

### 8.6 Backtesting and model validation
- [ ] Not started

### 8.7 AI research assistant
- [ ] Not started

---

## 7. Data Coverage

Data categories from scope document section 6.

| Category | Status | What we have | What's needed |
|---|---|---|---|
| Security master | - [ ] Partial | ticker, company name, sector, market cap, price | exchange, currency, country, asset type, industry, sub-industry, float, shares outstanding, CIK/FIGI/ISIN |
| Price and volume | - [ ] Partial | Current price + 3-month daily closes fetched on-demand (not stored) | Daily OHLCV stored in DB, adjusted prices, corporate actions, 52-week range, intraday data, real-time quotes |
| Fundamentals | - [ ] Partial | revenue growth, earnings growth, debt-to-equity, cash runway | Income statement, balance sheet, cash flow, margins, ROIC, dilution, SBC |
| Estimates and analyst | - [ ] Missing | Nothing | Forward EPS/revenue, revisions, price targets, ratings, earnings calendar |
| Alternative data | - [ ] Missing | Nothing | News, filings, transcripts, insider activity, institutional ownership, short interest, options data |
| Macro data | - [ ] Missing | Nothing | Interest rates, CPI, GDP, liquidity, sector indices, risk appetite |

---

## 8. Database Tables Status

Scope document section 13 recommends ~30+ tables. We have 6 (see section 14 for migration status).

### Current tables
- [x] `stocks` — stock metrics and scores
- [x] `watchlist` — simple watchlist (ticker + added_at)
- [x] `score_history` — historical score snapshots (migration 20261015191519)
- [x] `watchlists` — named watchlists (migration 20261015191530)
- [x] `watchlist_items` — per-list items with notes and tags (migration 20261015191530)
- [x] `catalysts` — dated events per stock: Yahoo earnings ingest + manual entries (migration 20261015220504)

### Phase 1 target tables
- [x] `score_history` — historical score snapshots for tracking changes
- [x] `catalysts` — upcoming events per stock
- [ ] `price_daily` — stored daily OHLCV (instead of on-demand fetch)

### Full document table list (Phase 2+)
- [ ] `users`
- [ ] `subscriptions`
- [ ] `user_preferences`
- [x] `watchlists` (named; per-user ownership via `owner_id` + RLS, migration 20261015220517)
- [x] `watchlist_items`
- [ ] `alerts`
- [ ] `alert_events`
- [ ] `portfolios`
- [ ] `positions`
- [ ] `research_notes`
- [ ] `tags`
- [ ] `audit_logs`
- [ ] `securities` (expanded master)
- [ ] `price_intraday`
- [ ] `corporate_actions`
- [ ] `market_snapshots`
- [ ] `technical_indicators`
- [ ] `macro_indicators`
- [ ] `fundamentals_quarterly`
- [ ] `fundamentals_annual`
- [ ] `analyst_estimates`
- [ ] `estimate_revisions`
- [ ] `price_targets`
- [ ] `earnings_events`
- [ ] `earnings_transcripts`
- [ ] `news_items`
- [ ] `filings`
- [ ] `insider_transactions`
- [ ] `institutional_holdings`
- [ ] `short_interest`
- [ ] `options_metrics`
- [ ] `score_runs`
- [ ] `dimension_scores`
- [ ] `risk_assessments`
- [ ] `model_versions`
- [ ] `model_weights`
- [ ] `backtests`
- [ ] `backtest_results`
- [ ] `scenario_calculations`
- [ ] `data_quality_checks`

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

| # | Item | Status | Effort | Notes |
|---|---|---|---|---|
| 16 | Full fundamental data ingestion | - [ ] | Hard | Paid data vendor needed (Alpha Vantage, Polygon, FMP) |
| 17 | Analyst estimates and revisions | - [ ] | Hard | Paid data feed required |
| 18 | News, SEC filings, transcripts | - [ ] | Hard | Expensive data subscriptions or fragile scrapers + search infra |
| 19 | Insider activity, institutional ownership, short interest | - [ ] | Hard | Separate data feeds, each with own schema |
| 20 | Options data | - [ ] | Hard | Specialized, often expensive data source |
| 21 | Macro and market regime data | - [ ] | Hard | Some free (FRED API), but regime model is a quant research problem |
| 22 | Backtesting engine | - [ ] | Hard | Historical price storage, score run snapshots, simulation engine |
| 23 | Alert system | - [ ] | Hard | Backend monitoring, per-user configs, notification delivery |
| 24 | AI research assistant | - [ ] | Hard | Needs underlying data first, plus retrieval system and guardrails |
| 25 | Simulated portfolios | - [ ] | Hard | Real-time prices, portfolio schema, calculation logic |
| 26 | Mobile app (React Native / Flutter) | - [ ] | Hard | Entirely separate codebase |
| 27 | Time-series storage architecture | - [ ] | Hard | Architectural shift from on-demand to stored time-series |
| 28 | Data-quality checks and monitoring | - [ ] | Hard | Operational infrastructure |

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

---

## 13. Environment

- **Supabase URL:** configured in `.env` (project: irbwaucilrznbqynhtmr)
- **Supabase Anon Key:** configured in `.env`
- **Edge function deployed:** `refresh-stocks` v5 (Yahoo Finance integration + earnings-date ingest into catalysts)
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
