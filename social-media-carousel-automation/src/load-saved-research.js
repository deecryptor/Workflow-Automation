// @include helpers
// Research saved by an earlier run whose brief failed (Claude cut off, timed out…). If the topic, request, style
// direction and references are unchanged, it is reused: no new searches or reference reading, only the brief is rewritten.
// Clear the "Research cache" field to force fresh research.
const { row } = ctx();
let saved = null;
try { saved = JSON.parse(String(row['Research cache'] || '')); } catch (e) { saved = null; }
const use = !!(saved && saved.body && saved.key === researchKey(row));
return [{ json: use ? { use: true, body: { ...saved.body, max_tokens: Math.max(Number(saved.body.max_tokens) || 0, Number(cfg.maxTokens) || 64000) }, sourcesText: saved.sourcesText || '', savedAt: saved.at || '' } : { use: false, stale: !!saved } }];
