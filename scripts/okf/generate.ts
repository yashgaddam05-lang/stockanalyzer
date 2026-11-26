// Builds the public OKF (Open Knowledge Format v0.3) bundle at public/okf from the scoring code.
// Everything here is derived from the same modules the site and the scorer use, so it cannot drift.
// Run via scripts/okf/build.mjs (bundled with esbuild, then checked by scripts/okf/check.mjs).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DIMENSIONS, MODEL_VERSION } from '../../src/lib/scoring/model';
import { DIMENSION_EXPLAINERS } from '../../src/lib/scoring/explain';
import { riskLabelFor } from '../../src/lib/scoring/risk';
import { PRESET_SCREENS } from '../../src/lib/scoring/presets';
import { DATA_SOURCES, STOCK_CHECK_LIMITS } from '../../src/lib/data-provenance';
import { PLAN_PRICES } from '../../api/_prices';

const SITE = 'https://3xhunter.com';
const OUT = process.argv[2] ?? 'public/okf';
const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const GENERATED = `{ by: "process:okf-build", at: "${NOW}" }`;

type Concept = {
  path: string; // bundle path, e.g. scoring/room-to-3x.md
  type: string;
  title: string;
  description: string;
  resource?: string;
  tags: string[];
  extra?: string[]; // extra frontmatter lines
  body: string;
};

const q = (s: string) => JSON.stringify(s); // YAML 1.2 accepts JSON strings
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function render(c: Concept): string {
  const fm = [
    '---',
    `type: ${q(c.type)}`,
    `title: ${q(c.title)}`,
    `description: ${q(c.description)}`,
    ...(c.resource ? [`resource: ${q(c.resource)}`] : []),
    `tags: [${c.tags.map(q).join(', ')}]`,
    'status: stable',
    `generated: ${GENERATED}`,
    `x-model-version: ${q(MODEL_VERSION)}`,
    ...(c.extra ?? []),
    '---',
    '',
  ];
  return fm.join('\n') + c.body.trim() + '\n';
}

const concepts: Concept[] = [];
const dimPath = (key: string) => `/scoring/${slug(DIMENSIONS.find((d) => d.key === key)!.label)}.md`;

// ---------- Scoring ----------
const total = DIMENSIONS.reduce((a, d) => a + d.weight, 0);
concepts.push({
  path: 'scoring/3x-score.md',
  type: 'Metric',
  title: '3x Opportunity Score',
  description: `A 0-100 score for how well a US stock fits the profile of companies with room to triple, from ${DIMENSIONS.length} weighted dimensions.`,
  resource: `${SITE}/methodology#dimensions`,
  tags: ['score', 'methodology'],
  extra: ['x-range: [0, 100]', 'x-higher-is: "better fit"'],
  body: `
# What it measures

How closely a stock matches the profile of companies that historically had room for a large move. It is a deterministic model (${MODEL_VERSION}), not a prediction, and not investment advice.

# How it is calculated

Each dimension is scored 0-100 from its inputs. The total is the weighted average of the dimensions that have data. A dimension with no usable inputs is left unscored and its weight is re-normalized across the rest. Missing inputs are never fabricated.

| Dimension | Weight |
|---|---|
${DIMENSIONS.map((d) => `| [${d.label}](${dimPath(d.key)}) | ${d.weight}% |`).join('\n')}
| Total | ${total}% |

# How to read it

- 70 and up: strong fit
- 55 to 69: decent
- 40 to 54: middling
- Under 40: weak

Confidence is high when at least 85% of the weight has data, medium from 65% to 85%, low below 65%. A separate [risk score](/scoring/risk-score.md) sits beside it, and every stock carries a [data quality grade](/data/quality-grades.md).
`,
});

for (const d of DIMENSIONS) {
  const ex = DIMENSION_EXPLAINERS[d.key];
  concepts.push({
    path: dimPath(d.key).slice(1),
    type: 'Metric',
    title: d.label,
    description: `${d.weight}% of the 3x Opportunity Score. ${ex.plain}`,
    resource: `${SITE}/methodology#dimensions`,
    tags: ['score', 'dimension', d.key],
    extra: [`x-weight-pct: ${d.weight}`, `x-dimension-key: ${q(d.key)}`, 'x-range: [0, 100]'],
    body: `
# In plain words

${ex.plain}

# How it is scored

${ex.how}

Inputs: ${d.inputs.map((i) => `\`${i}\``).join(', ')}.

Weight: ${d.weight}% of the [3x Opportunity Score](/scoring/3x-score.md). If none of the inputs are available, this dimension is left unscored and its weight is spread across the others.
`,
  });
}

// Risk bands are read from riskLabelFor so they always match the code.
const bands: { label: string; from: number; to: number }[] = [];
for (let s = 0; s <= 100; s++) {
  const label = riskLabelFor(s);
  const last = bands[bands.length - 1];
  if (last && last.label === label) last.to = s;
  else bands.push({ label, from: s, to: s });
}
concepts.push({
  path: 'scoring/risk-score.md',
  type: 'Metric',
  title: 'Risk score',
  description: 'A separate 0-100 risk score; higher means riskier. A stock can score high on both opportunity and risk.',
  resource: `${SITE}/methodology#risk`,
  tags: ['score', 'risk'],
  extra: ['x-range: [0, 100]', 'x-higher-is: "riskier"'],
  body: `
# Bands

| Band | Range |
|---|---|
${bands.map((b) => `| ${b.label} | ${b.from}-${b.to} |`).join('\n')}

# Inputs

Weighted and averaged over those available: annualized volatility, beta, debt to equity, cash runway, market cap (log scale, smaller is riskier) and net profit margin (falls back to the direction of earnings growth). With no risk inputs the score defaults to a neutral 50.

It is reported next to the [3x Opportunity Score](/scoring/3x-score.md), never folded into it.
`,
});

// ---------- Screens ----------
for (const p of PRESET_SCREENS) {
  concepts.push({
    path: `screens/${p.id}.md`,
    type: 'Screen',
    title: p.label,
    description: p.description,
    resource: `${SITE}/methodology#presets`,
    tags: ['screen', 'explore'],
    body: `
# Rule

${p.description}

Applied to every scored stock on Explore. Uses the [3x Opportunity Score](/scoring/3x-score.md) and the [risk score](/scoring/risk-score.md).
`,
  });
}

// ---------- Data ----------
for (const s of DATA_SOURCES) {
  concepts.push({
    path: `data/${slug(s.id)}.md`,
    type: 'Reference',
    title: s.name,
    description: `${s.publisher}. ${s.cadence}`,
    resource: `${SITE}/methodology#sources`,
    tags: ['data-source', s.official ? 'official' : 'unofficial'],
    extra: [`x-official: ${s.official}`],
    body: `
# Publisher

${s.publisher}

# Fields used

${s.fields.map((f) => `- ${f}`).join('\n')}

# Refresh

${s.cadence}

# Why it can be trusted

${s.trust}

# Limits

${s.limit}

Each stock's [data quality grade](/data/quality-grades.md) checks values from this source before they are used.
`,
  });
}

const L = STOCK_CHECK_LIMITS;
concepts.push({
  path: 'data/quality-grades.md',
  type: 'Reference',
  title: 'Data quality grades',
  description: 'Every stock gets a grade (Verified, Good, Check before using, Unreliable) from 8 automatic checks.',
  resource: `${SITE}/methodology#stock-checks`,
  tags: ['data-quality', 'trust'],
  body: `
# Grades

Verified, Good, Check before using, Unreliable. Weak data is labelled, never hidden.

# The 8 checks

1. Live source (not a placeholder value)
2. Freshness: fresh under ${L.freshHours} h, stale after ${L.staleHours} h, broken after ${L.brokenHours / 24} days
3. Valid price (positive, non-zero)
4. Price inside its 52-week range, within ${Math.round(L.rangeTolerance * 100)}% tolerance (cross-checks two feeds)
5. Analyst targets in order (low, mean, high)
6. No impossible values (growth over ${L.maxGrowthPct}%, forward P/E over ${L.maxForwardPe}, volatility over ${L.maxVolatility}%)
7. Key fields present (at least ${L.minKeyFields})
8. Score confidence from the [3x Opportunity Score](/scoring/3x-score.md)

Sources: ${DATA_SOURCES.map((s) => `[${s.name}](/data/${slug(s.id)}.md)`).join(', ')}.
`,
});

// ---------- Plans ----------
const p = PLAN_PRICES;
concepts.push({
  path: 'plans/pricing.md',
  type: 'Reference',
  title: 'Plans and pricing',
  description: `Free to start. Pro ${p.pro.month.label}, Pro Plus ${p.pro_plus.month.label}.`,
  resource: `${SITE}/pricing`,
  tags: ['pricing'],
  body: `
| Plan | Monthly | Yearly |
|---|---|---|
| Free | $0 | $0 |
| Pro | ${p.pro.month.label} | ${p.pro.year.label} |
| Pro Plus | ${p.pro_plus.month.label} | ${p.pro_plus.year.label} |

Free shows every [3x Opportunity Score](/scoring/3x-score.md). Pro adds the full per-dimension breakdown, scenarios, more AI credits, voice and more alerts. Billing runs on Stripe. Full details: ${SITE}/pricing
`,
});

// ---------- Playbook ----------
concepts.push({
  path: 'playbooks/read-a-score.md',
  type: 'Playbook',
  title: 'How to read a 3x Hunter score',
  description: 'Steps for a person or agent to interpret a stock page correctly.',
  resource: `${SITE}/methodology#simple`,
  tags: ['guide'],
  body: `
# Steps

1. Check the [data quality grade](/data/quality-grades.md) first. If it is Check or Unreliable, verify the figures before relying on them.
2. Read the [3x Opportunity Score](/scoring/3x-score.md) and its confidence. 70+ is a strong fit; a low-confidence score is missing data, not a weak company.
3. Read the [risk score](/scoring/risk-score.md) separately. High opportunity with extreme risk is a different bet from high opportunity with low risk.
4. Look at the weakest dimensions, for example [Room to 3x](${dimPath('headroom')}), to see what holds the score back.
5. Treat it as a research starting point. A high score is a model fit, not a prediction, and not investment advice.
`,
});

// ---------- Write concepts + indexes ----------
rmSync(OUT, { recursive: true, force: true });
for (const c of concepts) {
  const file = join(OUT, c.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, render(c));
}

const groups: { dir: string; heading: string; blurb: string }[] = [
  { dir: 'scoring', heading: 'Scoring', blurb: 'The 3x Opportunity Score, its dimensions and the risk score' },
  { dir: 'screens', heading: 'Screens', blurb: 'Ready-made strategies on Explore' },
  { dir: 'data', heading: 'Data', blurb: 'Where every number comes from and how it is checked' },
  { dir: 'plans', heading: 'Plans', blurb: 'Free, Pro and Pro Plus' },
  { dir: 'playbooks', heading: 'Playbooks', blurb: 'How to use the scores' },
];
const entry = (c: Concept, rel: string) => `* [${c.title}](${rel}) - ${c.description}`;
for (const g of groups) {
  const items = concepts.filter((c) => c.path.startsWith(`${g.dir}/`));
  writeFileSync(join(OUT, g.dir, 'index.md'), `# ${g.heading}\n\n${items.map((c) => entry(c, c.path.slice(g.dir.length + 1))).join('\n')}\n`);
}
writeFileSync(
  join(OUT, 'index.md'),
  `---
okf_version: "0.3"
title: "3x Hunter methodology"
description: "How 3x Hunter scores US stocks: the 3x Opportunity Score, its ${DIMENSIONS.length} dimensions, the risk score, screens, data sources and data quality checks. Model ${MODEL_VERSION}."
license: "CC-BY-4.0"
---
# 3x Hunter knowledge bundle

Open Knowledge Format (OKF) v0.3. Generated from the 3x Hunter scoring code on every deploy. Cite as "3x Hunter (${SITE})". Educational research, not investment advice.

${groups.map((g) => `* [${g.heading}](${g.dir}/) - ${g.blurb}`).join('\n')}
`,
);
writeFileSync(
  join(OUT, 'log.md'),
  `# Log\n\n## ${NOW.slice(0, 10)}\n\n* Bundle generated for scoring model ${MODEL_VERSION}: ${concepts.length} concepts.\n`,
);
console.log(`okf: wrote ${concepts.length} concepts to ${OUT}`);
