// @include helpers
// Runs when any step fails (this workflow is its own error workflow). Finds the Content row the failed run
// was working on and marks it "Needs attention" with the error at the top of the Posting log, so failures
// show up in Baserow instead of leaving the Status stuck on "…".
// Each step stamps its n8n execution id into the row's "n8n run" field; if that field is missing,
// the single row whose Status ends in "…" is used. If neither matches, nothing is changed.

const ex = ($('Error Trigger').first().json || {}).execution || {};
const rows = (($input.first().json || {}).results) || [];
let row = rows.find(r => ex.id && txt(r['n8n run']) === String(ex.id));
if (!row) {
  const busy = rows.filter(r => /…$/.test(sel(r.Status)) || /^finalising/i.test(sel(r.Status)));
  if (busy.length === 1) row = busy[0];
}
if (!row) return [];

const msg = txt((ex.error && (ex.error.message || ex.error.description)) || 'unknown error').slice(0, 600);
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const step = sel(row.Status).replace(/…$/, '').trim() || 'A step';
const line = [
  `${stamp} UTC · ❌ ${step} failed at "${ex.lastNodeExecuted || '?'}": ${msg}`,
  ex.url ? `Details: ${ex.url}` : 'Details: n8n → Executions',
  'Fix the cause, then press the same button again.',
].join('\n');

return [{ json: { url: rowUrl(T.content, row.id), body: { Status: opt('Status', 'Needs attention'), 'Posting log': `${line}\n${txt(row['Posting log'])}`.trim() } } }];
