// Builds the Vapi voice assistant's system prompt from scripts/vapi-voice-rules.md plus the website assistant's
// knowledge (api/_assistant-knowledge.ts), so the voice agent always matches the live site.
//
//   node scripts/sync-vapi.mjs            -> writes scripts/vapi-system-prompt.txt (paste into Vapi)
//   VAPI_API_KEY=... VAPI_ASSISTANT_ID=... node scripts/sync-vapi.mjs --push   -> also updates the assistant in Vapi
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(join(root, 'scripts/vapi-voice-rules.md'), 'utf8').trim();
const src = readFileSync(join(root, 'api/_assistant-knowledge.ts'), 'utf8');
const match = src.match(/ASSISTANT_KNOWLEDGE = `([\s\S]*?)`\.trim\(\)/);
if (!match) throw new Error('Could not find ASSISTANT_KNOWLEDGE in api/_assistant-knowledge.ts');
// Drop the line about "this chat" (that's the in-app assistant, not the phone agent).
const knowledge = match[1]
  .trim()
  .split('\n')
  .filter((l) => !/Research assistant \(this chat\)/.test(l) && !/^\s+profile and portfolios, uses live web data/.test(l) && !/^\s+remembers summaries of their earlier chats/.test(l))
  .join('\n');

const prompt = `${rules}\n\n${knowledge}\n`;
const FIRST_MESSAGE =
  "Hi, this is the 3x Hunter assistant. I can explain how the app works, what the scores mean, or which plan fits you. What can I help with?";

const out = join(root, 'scripts/vapi-system-prompt.txt');
writeFileSync(out, prompt);
console.log(`Wrote ${out} (${prompt.length.toLocaleString()} characters)`);

if (process.argv.includes('--push')) {
  const key = process.env.VAPI_API_KEY;
  const id = process.env.VAPI_ASSISTANT_ID;
  if (!key || !id) throw new Error('Set VAPI_API_KEY (private key) and VAPI_ASSISTANT_ID to push.');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const current = await fetch(`https://api.vapi.ai/assistant/${id}`, { headers });
  if (!current.ok) throw new Error(`Vapi GET failed: ${current.status} ${await current.text()}`);
  const assistant = await current.json();
  // Keep the provider/model/temperature already chosen in the dashboard; replace only the system message.
  const model = { ...assistant.model, messages: [{ role: 'system', content: prompt }] };
  const res = await fetch(`https://api.vapi.ai/assistant/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ model, firstMessage: FIRST_MESSAGE }),
  });
  if (!res.ok) throw new Error(`Vapi PATCH failed: ${res.status} ${await res.text()}`);
  console.log(`Updated Vapi assistant "${assistant.name}" (${model.provider} ${model.model}).`);
}
