# 3x Hunter — Project Progress Tracker

**Last updated:** 2026-10-14
**Current phase:** Phase 1 MVP (subset) — ~30% complete
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
- **Data refresh:** Supabase Edge Function (Deno runtime) fetching from Yahoo Finance free endpoints

### Import conventions
- Use `@/` path alias for all project imports (maps to `src/`)
- Example: `import { Stock } from '@/lib/supabase'` not `import { Stock } from '../../lib/supabase'`

### File organization
- `src/lib/` — business logic, API clients, utilities
- `src/components/` — feature components (StockDetailModal, StatsOverview, etc.)
- `src/components/ui/` — reusable Radix-based UI primitives (button, card, badge, etc.)
- `src/App.tsx` — main application entry
- `supabase/migrations/` — database migrations
- `supabase/functions/` — edge functions

### Supabase rules
- RLS enabled on every table — no exceptions.
- No-auth app pattern: policies scoped to `TO anon, authenticated` (anyone can read/write since there's no login yet).
- When auth is added: switch to `TO authenticated` with `auth.uid()` ownership checks.
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
| Phase | Phase 1 MVP subset | ~30% through Phase 1 |
| Stock universe | 24 stocks seeded | Document targets 200–500 |
| Scoring dimensions | 6 of 8 | 2 missing, 2 non-standard |
| Risk model | Basic labels only | No independent 0–100 risk score |
| UX | Single page + modal | No multi-page navigation |
| User accounts | None | No auth, no per-user data |
| Database tables | 2 of ~30+ | stocks, watchlist only |
| Data pipeline | 1 edge function | Yahoo Finance free endpoints, on-demand refresh |
| Charts | None | No price charts or visualizations beyond progress bars |

---

## 5. Scoring Dimensions Status

The scope document specifies 8 dimensions. Current implementation has 6, with 2 that don't match the document.

| # | Document dimension | Weight | Status | Current implementation | What's needed |
|---|---|---:|---|---|---|
| 1 | Growth Potential | 20% | - [ ] Partial | Split into "Revenue Growth" (25pts) + "Earnings Growth" (20pts) — non-standard | Merge into single Growth Potential dimension with 20% weight |
| 2 | Valuation Upside | 18% | - [ ] Missing | Not implemented at all | Forward P/E, EV/Sales, PEG, price-target upside, peer comparison |
| 3 | Momentum | 15% | - [ ] Partial | Basic MA5/MA20 ratio + 20-day return. No estimate revisions, earnings surprises, short interest, relative strength | Add estimate revisions, relative strength vs sector, volume trends |
| 4 | Fundamental Quality | 12% | - [ ] Partial | "Financial Health" — debt-to-equity + cash runway only. No margins, FCF, ROIC, dilution | Add gross/operating/net margins, FCF margin, ROIC, dilution tracking |
| 5 | Catalyst Strength | 12% | - [ ] Missing | Not implemented | Catalyst calendar table, earnings dates, product launches, regulatory events |
| 6 | Market Position | 10% | - [ ] Missing | Not implemented | Market share, moat indicators, pricing power, customer concentration |
| 7 | Risk & Volatility | 8% | - [ ] Partial | "Volatility / Upside Potential" — volatility + beta only. Not scored independently | Separate risk score (0–100), risk label, risk explanation, invalidation signals |
| 8 | Market Regime Fit | 5% | - [ ] Missing | Not implemented | Macro indicators, rate trends, sector rotation, growth vs value |

**Non-standard dimension to remove:** "Innovation & Pipeline" (15pts) — not in the document's framework. R&D ratio and pipeline count can feed into Growth Potential and Catalyst Strength instead.

---

## 6. Feature Status

Features from scope document sections 8.1–8.7.

### 8.1 Discovery and ranking
- [x] Ranked grid of curated stocks (sorted by score)
- [x] Basic filters: search, sector, risk level
- [x] Sort by: score, revenue growth, momentum, volatility, market cap
- [ ] Top 10 / Top 25 / Top 100 opportunity lists
- [ ] Filters by: industry, market cap bucket, price, liquidity, profitability, catalyst date
- [ ] Preset screens (highest 3x, best risk-adjusted, highest momentum, most undervalued, catalysts imminent, new score breakouts, oversold quality, profitable compounders)
- [ ] Score-change leaderboard
- [ ] Sector and market-cap heat maps
- [ ] Saved custom screens

### 8.2 Stock detail page
- [x] 3x Opportunity Score and risk badge
- [x] One-sentence investment thesis
- [x] Dimension score breakdown (partial — 6 of 8 dimensions)
- [x] Key catalysts list
- [x] Key risks list
- [x] Basic metrics table
- [ ] Dedicated page (currently a modal popup, not a full page)
- [ ] Price, market cap, volume, and liquidity summary
- [ ] Bull case, bear case, and neutral case (currently only generic catalysts/risks)
- [ ] Catalyst calendar
- [ ] Valuation versus peers
- [ ] Financial trend charts
- [ ] Price chart with earnings, news, and score-change markers
- [ ] Analyst estimates and revisions
- [ ] Short interest and insider activity
- [ ] News and SEC filings
- [ ] 3x scenario calculator
- [ ] Thesis invalidation signals
- [ ] Historical score trend

### 8.3 3x scenario calculator
- [ ] Not started

### 8.4 Watchlists and simulated portfolios
- [x] Basic watchlist (add/remove stocks, single shared list)
- [ ] Named watchlists (multiple lists)
- [ ] Notes and tags per stock
- [ ] Score change tracking per watchlist
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

Scope document section 13 recommends ~30+ tables. We have 2.

### Current tables
- [x] `stocks` — stock metrics and scores
- [x] `watchlist` — simple watchlist (ticker + added_at)

### Phase 1 target tables
- [ ] `score_history` — historical score snapshots for tracking changes
- [ ] `catalysts` — upcoming events per stock
- [ ] `price_daily` — stored daily OHLCV (instead of on-demand fetch)

### Full document table list (Phase 2+)
- [ ] `users`
- [ ] `subscriptions`
- [ ] `user_preferences`
- [ ] `watchlists` (named, per-user)
- [ ] `watchlist_items`
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
| 1 | Multi-page navigation and layout shell | - [ ] | Medium | Add routing, nav bar, separate pages for Dashboard, Explore, Stock Detail |
| 2 | Dedicated stock detail page (replace modal) | - [ ] | Small | Move modal content to full page with clean URL |
| 3 | Expand scoring from 6 to 8 dimensions | - [ ] | Medium | Add Valuation Upside + Market Position, remove Innovation & Pipeline, align weights to document |
| 4 | Independent risk score (0–100) | - [ ] | Small | Calculate from existing fields: volatility, beta, debt-to-equity, cash runway, market cap |
| 5 | Bull case / bear case / neutral case | - [ ] | Small | Expand existing catalysts/risks into three structured cases |
| 6 | Preset screens | - [ ] | Small | Add preset filter buttons: highest 3x, best risk-adjusted, most undervalued, etc. |
| 7 | Named watchlists with notes and tags | - [ ] | Medium | New tables: watchlists, watchlist_items. Per-stock notes. |
| 8 | Score-change tracking | - [ ] | Small | Store previous score, show delta on cards and detail page |
| 9 | Expand stock universe (24 → 100+) | - [ ] | Small | Insert more seed data into existing stocks table |
| 10 | Disclaimer and compliance text | - [ ] | Small | Methodology page, proper disclaimers, data-source attribution |

## 10. Roadmap — Medium Difficulty

Need some new data or infrastructure, but achievable without paid services.

| # | Item | Status | Effort | Notes |
|---|---|---|---|---|
| 11 | Price charts on stock detail pages | - [ ] | Medium | Add charting library (Recharts), wire to Yahoo Finance chart data |
| 12 | Catalyst calendar | - [ ] | Medium | New table, populate earnings dates from Yahoo, manual entry for others |
| 13 | 3x scenario calculator | - [ ] | Medium | Math + UI. No external data needed. Logic in scope doc section 8.3. |
| 14 | User accounts and authentication | - [ ] | Medium | Supabase Auth, email/password. Tie watchlists to users. |
| 15 | Sector and market-cap heat maps | - [ ] | Medium | Visualization from existing sector/market cap data |

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

### Session 2 — 2026-10-14 (this session)
- Created PROGRESS.md tracking document
- Assessed current state against full scope document
- Identified low-hanging fruit, medium, and tough roadmap items
- Documented design and architecture standards

---

## 13. Environment

- **Supabase URL:** configured in `.env` (project: irbwaucilrznbqynhtmr)
- **Supabase Anon Key:** configured in `.env`
- **Edge function deployed:** `refresh-stocks` (Yahoo Finance integration)
- **No git repository** — not under version control
- **No GitHub remote** — not pushed to any remote
