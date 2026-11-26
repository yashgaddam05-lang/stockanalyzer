// Validates an OKF bundle. Fails (exit 1) on: missing frontmatter or `type`, empty title/description,
// duplicate keys, broken in-bundle links, or a scoring dimension with no concept file.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

export function checkBundle(root, expectFiles = []) {
  const errors = [];
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(root).filter((f) => f.endsWith('.md'));
  let concepts = 0;
  for (const f of files) {
    const rel = relative(root, f);
    const text = readFileSync(f, 'utf8');
    const base = rel.split('/').pop();
    const isIndex = base === 'index.md';
    const isLog = base === 'log.md';
    const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!isIndex && !isLog) {
      concepts++;
      if (!m) { errors.push(`${rel}: missing frontmatter`); continue; }
      const keys = m[1].split('\n').filter((l) => /^[A-Za-z_-][\w-]*:/.test(l)).map((l) => l.split(':')[0]);
      const dup = keys.find((k, i) => keys.indexOf(k) !== i);
      if (dup) errors.push(`${rel}: duplicate key ${dup}`);
      for (const k of ['type', 'title', 'description']) {
        const line = m[1].split('\n').find((l) => l.startsWith(`${k}:`));
        const val = line?.slice(k.length + 1).trim();
        if (!val || val === '""' || val === 'null' || val === "''") errors.push(`${rel}: empty or missing ${k}`);
      }
      const body = text.slice(m[0].length).trim();
      if (body.length < 20) errors.push(`${rel}: body is empty`);
    }
    if (isLog && m) errors.push(`${rel}: log.md must not have frontmatter`);
    if (isIndex && m && rel !== 'index.md') errors.push(`${rel}: only the root index.md may have frontmatter`);
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
      const clean = target.split('#')[0];
      const abs = clean.startsWith('/') ? join(root, clean) : resolve(dirname(f), clean);
      const ok = existsSync(abs) && (statSync(abs).isFile() || existsSync(join(abs, 'index.md')));
      if (!ok) errors.push(`${rel}: broken link ${target}`);
    }
  }
  for (const f of expectFiles) if (!existsSync(join(root, f))) errors.push(`missing concept ${f}`);
  if (!existsSync(join(root, 'index.md'))) errors.push('missing root index.md');
  return { errors, concepts, files: files.length };
}
