export const meta = {
  name: 'roadmap-swarm',
  description: 'Release the 3x Hunter engineering swarm on roadmap items: plan, build in parallel worktrees, review, integrate, QA',
  whenToUse: 'Pass args: { items: ["1", "2", "Multi-page navigation"], fixRounds?: 2 }. Items are PROGRESS.md roadmap numbers or free text.',
  phases: [
    { title: 'Plan', detail: 'swarm-lead splits items into conflict-free work packages and waves' },
    { title: 'Build', detail: 'one role agent per package, isolated git worktree each' },
    { title: 'Review', detail: 'swarm-reviewer on each branch, owner fixes until approved' },
    { title: 'Integrate', detail: 'merge approved branches into one integration branch' },
    { title: 'QA', detail: 'swarm-qa gate: SHIP or BLOCK' },
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

phase('Plan')
const plan = await agent(
  `Plan work packages for these roadmap items: ${JSON.stringify(items)}.
Packages in the same wave must not share any file. Contracts (types, migrations, endpoint shapes) go in earlier waves.`,
  { agentType: 'swarm-lead', schema: PLAN, label: 'lead:plan' })
log(`${plan.waves.length} wave(s), ${plan.waves.flat().length} package(s). ${plan.notes ?? ''}`)

const approved = []
const rejected = []
let base = 'main'

for (let w = 0; w < plan.waves.length; w++) {
  const wave = plan.waves[w]
  const results = await pipeline(
    wave,
    pkg => agent(
      `Work package "${pkg.id}" (wave ${w + 1}).
Start by running: git checkout -b swarm/${pkg.id} ${base}
Spec: ${pkg.spec}
You may ONLY touch: ${pkg.files.join(', ')}
Acceptance: ${pkg.acceptance.map(a => '- ' + a).join('\n')}
Commit your work on swarm/${pkg.id}. Return the branch name and commit sha.`,
      { agentType: ROLE_AGENT[pkg.role], isolation: 'worktree', schema: BUILD, phase: 'Build', label: `${pkg.role}:${pkg.id}` }),
    async (built, pkg) => {
      let review = null
      for (let round = 0; round <= FIX_ROUNDS; round++) {
        review = await agent(
          `Review branch ${built.branch} (git diff ${base}...${built.branch}). Package spec: ${pkg.spec}`,
          { agentType: 'swarm-reviewer', schema: REVIEW, phase: 'Review', label: `review:${pkg.id}:r${round}` })
        if (review.verdict === 'APPROVE' || round === FIX_ROUNDS) break
        built = await agent(
          `git checkout ${built.branch}. Address these review findings, commit, return the branch:\n${review.findings.join('\n')}`,
          { agentType: ROLE_AGENT[pkg.role], isolation: 'worktree', schema: BUILD, phase: 'Review', label: `fix:${pkg.id}:r${round}` })
      }
      return { pkg, built, review }
    })
  for (const r of results.filter(Boolean)) {
    (r.review.verdict === 'APPROVE' ? approved : rejected).push(r)
  }
  if (rejected.length) log(`Wave ${w + 1}: ${rejected.length} package(s) not approved: ${rejected.map(r => r.pkg.id).join(', ')}`)

  if (w < plan.waves.length - 1) {
    // later waves build on this wave's approved work
    const next = `swarm/wave-${w + 1}`
    await agent(
      `Create branch ${next} from ${base} and merge these branches into it: ${results.filter(Boolean).filter(r => r.review.verdict === 'APPROVE').map(r => r.built.branch).join(', ')}. Resolve conflicts conservatively, run npm run build, commit.`,
      { agentType: 'swarm-devops', phase: 'Integrate', label: `integrate:wave-${w + 1}` })
    base = next
  }
}

phase('Integrate')
const integration = await agent(
  `Create branch swarm/integration from main and merge, in order: ${approved.map(r => r.built.branch).join(', ')}.
Resolve conflicts, then npm run build and npm run typecheck must pass. Do NOT push and do NOT merge into main. Return a short report.`,
  { agentType: 'swarm-devops', label: 'integrate:final' })

phase('QA')
const qa = await agent(
  `Check out swarm/integration and verify against these acceptance criteria:\n${approved.flatMap(r => r.pkg.acceptance.map(a => `[${r.pkg.id}] ${a}`)).join('\n')}`,
  { agentType: 'swarm-qa', schema: QA, label: 'qa:gate' })

return {
  verdict: qa.verdict,
  defects: qa.defects,
  shipped: approved.map(r => ({ id: r.pkg.id, title: r.pkg.title, branch: r.built.branch, summary: r.built.summary, blocked: r.built.blocked })),
  notApproved: rejected.map(r => ({ id: r.pkg.id, findings: r.review.findings })),
  integration,
}
