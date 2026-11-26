// Generates public/okf (OKF bundle) from the scoring code, then validates it. Runs before `vite build`.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBundle } from './check.mjs';

const out = process.argv[2] ?? 'public/okf';
const tmp = mkdtempSync(join(tmpdir(), 'okf-'));
const script = join(tmp, 'generate.mjs');
try {
  await build({
    entryPoints: ['scripts/okf/generate.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: script,
    tsconfig: 'tsconfig.app.json',
    logLevel: 'error',
  });
  execFileSync(process.execPath, [script, out], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const expect = ['scoring/3x-score.md', 'scoring/risk-score.md', 'data/quality-grades.md'];
const { errors, concepts } = checkBundle(out, expect);
if (concepts < 10) errors.push(`only ${concepts} concepts generated`);
if (errors.length) {
  console.error(`okf: ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`okf: bundle OK (${concepts} concepts)`);
