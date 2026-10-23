# 3x Hunter (stockanalyzer)

Stock opportunity scanner ranking stocks by a 0-100 "3x Opportunity Score". Educational research tool, not investment advice.
Built in Bolt, deployed on Vercel. Roadmap, design standards and architecture standards live in `PROGRESS.md` — follow them.

## Stack
- Vite + React 18 + TypeScript + Tailwind 3 + Radix UI + lucide-react
- `api/*.ts` — Vercel Node serverless routes (server-side Supabase access)
- `supabase/` — migrations + `refresh-stocks` Edge Function (Yahoo Finance)
- Browser never talks to Supabase directly; it calls `/api/*` via `src/lib/api.ts`

## Traps that have broken prod
- `package.json` is `"type": "module"` → relative imports in `api/` MUST end in `.js` (`./_supabase.js`).
  Build passes either way; runtime crashes with ERR_MODULE_NOT_FOUND. Check:
  `npx tsc --noEmit --module nodenext --moduleResolution nodenext --skipLibCheck --strict api/*.ts`
- Env vars (`DATABASE_URL`, `DATABASE_ANON_KEY`) are set for Production only; previews 500 until added.
- Client-side routes need an SPA rewrite in `vercel.json` that excludes `/api/`.
- Commits must be authored as `yashgaddam05@gmail.com` (repo-local git config). Any other author →
  Vercel silently skips the build (`buildSkipped`, status UNKNOWN).

- Installable app (PWA): `sw/sw.js` is emitted by `vite.config.ts` with a per-build id (not in `public/`), with
  `precache-manifest.json`. It must never cache `/api` or other origins. Icons + manifest live in `public/`.

## Vercel
- Project lives in team scope `bolot1`; the Vercel MCP connector has no access. Use the CLI with `--scope bolot1`.
- Logs: `vercel logs --scope bolot1 --project stockanalyzer --json`
- Pushing to `main` deploys to production.

## Verify before done
`npm run build && npm run typecheck && npm run lint` + the api tsc check above.

## Swarm
Role agents in `.claude/agents/swarm-*.md`: lead, frontend, backend, data, quant, devops, qa, reviewer.
Release on roadmap items with the saved workflow `roadmap-swarm` (args: `{ items: ["1","2"] }`).
Each package runs in its own worktree on `swarm/<id>`; results land on `swarm/integration`, never directly on main.
