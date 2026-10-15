export const meta = {
  name: 'roadmap-swarm',
  description: 'Release the 3x Hunter engineering swarm on roadmap items: plan, build in parallel worktrees, review, integrate, QA',
  whenToUse: 'Pass args: { items: ["1", "2", "Multi-page navigation"], fixRounds?: 2, autoShip?: true, context?: "extra guidance" }. Items are PROGRESS.md roadmap numbers or free text.',
  phases: [
    { title: 'Plan', detail: 'swarm-lead splits items into conflict-free work packages and waves' },
    { title: 'Build', detail: 'one role agent per package, isolated git worktree each' },
    { title: 'Review', detail: 'swarm-reviewer on each branch, owner fixes until approved' },
    { title: 'Integrate', detail: 'merge approved branches into one integration branch' },
    { title: 'QA', detail: 'swarm-qa gate: SHIP or BLOCK' },
    { title: 'Ship', detail: 'autoShip: merge to main, deploy, smoke test, rollback on failure' },
  ],
}

const items = Array.isArray(args?.items) ? args.items : [String(args?.items ?? args ?? '')]
const FIX_ROUNDS = args?.fixRounds ?? 2
const ROLE_AGENT = {
  frontend: 'swarm-frontend', backend: 'swarm-backend', data: 'swarm-data',
  quant: 'swarm-quant', devops: 'swarm-devops',
}

const PLAN = {
  type: 'object',
  properties: {
    waves: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'kebab-case, used as branch suffix' },
            role: { type: 'string', enum: Object.keys(ROLE_AGENT) },
            title: { type: 'string' },
            spec: { type: 'string', description: 'what to build, with any contracts it must match' },
            files: { type: 'array', items: { type: 'string' } },
            acceptance: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'role', 'title', 'spec', 'files', 'acceptance'],
        },
      },
    },
    notes: { type: 'string' },
  },
  required: ['waves'],
}
const BUILD = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    commit: { type: 'string' },
    summary: { type: 'string' },
    blocked: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'summary'],
}
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'CHANGES_REQUESTED'] },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings'],
}
const QA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['SHIP', 'BLOCK'] },
    defects: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string' },
  },
  required: ['verdict', 'defects'],
}

const REPO = args?.repo ?? '/Users/yashgaddam/ai/stockanalyzer'
const WT = `${REPO}-wt`

// Use the native project agent when this session registered it; otherwise load the role file.
async function role(name, prompt, opts) {
  try {
    return await agent(`Repo: ${REPO}. ${prompt}`, { ...opts, agentType: name })
  } catch (e) {
    return await agent(
      `You are the ${name} agent of the 3x Hunter engineering swarm. Repo: ${REPO}.
FIRST read ${REPO}/.claude/agents/${name}.md (your role definition) and ${REPO}/CLAUDE.md, and follow them strictly.
Run every command from the directory named below, never elsewhere.

${prompt}`,
      { ...opts, agentType: 'general-purpose' })
  }
}

phase('Plan')
const plan = await role('swarm-lead',
  `Plan work packages for these roadmap items: ${JSON.stringify(items)}.
${args?.context ?? ''}
Work in ${REPO} (read-only). Packages in the same wave must not share any file. Contracts (types, migrations, endpoint shapes) go in earlier waves.`,
  { schema: PLAN, label: 'lead:plan' })
log(`${plan.waves.length} wave(s), ${plan.waves.flat().length} package(s). ${plan.notes ?? ''}`)

const approved = []
const rejected = []
let base = 'main'

for (let w = 0; w < plan.waves.length; w++) {
  const wave = plan.waves[w]
  const waveBase = base
  const results = await pipeline(
    wave,
    pkg => role(ROLE_AGENT[pkg.role],
      `Work package "${pkg.id}" (wave ${w + 1}).
Set up your own git worktree first:
  cd ${REPO} && git worktree add ${WT}/${pkg.id} -b swarm/${pkg.id} ${waveBase} && cd ${WT}/${pkg.id} && npm ci --silent
Work ONLY inside ${WT}/${pkg.id}.
Spec: ${pkg.spec}
You may ONLY touch: ${pkg.files.join(', ')}
Acceptance:
${pkg.acceptance.map(a => '- ' + a).join('\n')}
Commit your work on swarm/${pkg.id}. Return the branch name and commit sha.`,
      { schema: BUILD, phase: 'Build', label: `${pkg.role}:${pkg.id}` }),
    async (built, pkg) => {
      let review = null
      for (let round = 0; round <= FIX_ROUNDS; round++) {
        review = await role('swarm-reviewer',
          `Review branch swarm/${pkg.id}: run git diff ${waveBase}...swarm/${pkg.id} inside ${WT}/${pkg.id}. Package spec: ${pkg.spec}`,
          { schema: REVIEW, phase: 'Review', label: `review:${pkg.id}:r${round}` })
        if (review.verdict === 'APPROVE' || round === FIX_ROUNDS) break
        built = await role(ROLE_AGENT[pkg.role],
          `cd ${WT}/${pkg.id} (worktree on swarm/${pkg.id}). Address these review findings, commit, return the branch:
${review.findings.join('\n')}`,
          { schema: BUILD, phase: 'Review', label: `fix:${pkg.id}:r${round}` })
      }
      return { pkg, built, review }
    })
  const ok = results.filter(Boolean).filter(r => r.review.verdict === 'APPROVE')
  for (const r of results.filter(Boolean)) (r.review.verdict === 'APPROVE' ? approved : rejected).push(r)
  log(`Wave ${w + 1}: ${ok.length}/${wave.length} approved` + (rejected.length ? `; not approved so far: ${rejected.map(r => r.pkg.id).join(', ')}` : ''))

  if (w < plan.waves.length - 1 && ok.length) {
    // later waves build on this wave's approved work
    const next = `swarm/wave-${w + 1}`
    await role('swarm-devops',
      `cd ${REPO} && git worktree add ${WT}/wave-${w + 1} -b ${next} ${waveBase} && cd ${WT}/wave-${w + 1} && npm ci --silent.
Merge these branches into ${next}: ${ok.map(r => `swarm/${r.pkg.id}`).join(', ')}. Resolve conflicts conservatively, npm run build must pass, commit. Do not push.`,
      { phase: 'Integrate', label: `integrate:wave-${w + 1}` })
    base = next
  }
}

phase('Integrate')
const integration = await role('swarm-devops',
  `cd ${REPO} && git worktree add ${WT}/integration -b swarm/integration main && cd ${WT}/integration && npm ci --silent.
Merge, in order: ${approved.map(r => `swarm/${r.pkg.id}`).join(', ')}.
Resolve conflicts, then npm run build and npm run typecheck must pass. Commit. Do NOT push and do NOT touch main. Return a short report.`,
  { label: 'integrate:final' })

phase('QA')
const qa = await role('swarm-qa',
  `Verify inside ${WT}/integration (branch swarm/integration, deps installed). Acceptance criteria:
${approved.flatMap(r => r.pkg.acceptance.map(a => `[${r.pkg.id}] ${a}`)).join('\n')}`,
  { schema: QA, label: 'qa:gate' })

let ship = 'not shipped'
if (qa.verdict === 'SHIP' && args?.autoShip) {
  phase('Ship')
  ship = await role('swarm-devops',
    `QA passed. Ship swarm/integration to production, working in ${REPO}:
1. cd ${REPO} && git checkout main && git pull && git merge --no-ff swarm/integration -m "Ship roadmap: ${items.join(', ')}" (author must be yashgaddam05@gmail.com; repo-local config already set).
2. npm ci && npm run build && npm run typecheck must pass, else abort and report.
3. git push origin main.
4. Git-triggered Vercel builds are unreliable for this project, so also run from ${REPO}: vercel deploy --prod --yes --scope bolot1
5. Smoke test from ${REPO}: vercel curl /api/stocks --deployment <url> --yes must return a JSON array; check vercel logs --scope bolot1 --project stockanalyzer for new errors.
6. If the smoke test fails: vercel rollback --scope bolot1 --yes, and report.
7. Clean up: git worktree remove --force for each dir under ${WT}, then git worktree prune.
Return the deployment URL and smoke-test results.`,
    { label: 'devops:ship' })
}

return {
  ship,
  verdict: qa.verdict,
  defects: qa.defects,
  shipped: approved.map(r => ({ id: r.pkg.id, title: r.pkg.title, summary: r.built?.summary, blocked: r.built?.blocked })),
  notApproved: rejected.map(r => ({ id: r.pkg.id, findings: r.review.findings })),
  integration,
}
