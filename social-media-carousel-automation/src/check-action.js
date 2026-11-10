// @include helpers
// Reads the button click (?action=…&row=…), checks the row is ready for that step, and prepares a reply page.

const q = ($('Carousel Webhook').first().json || {}).query || {};
const action = String(q.action || '').toLowerCase();
const row = { ...($input.first().json || {}) };
// Field names are matched ignoring capitals and extra spaces, so "Style Direction" or "Reference Files" work too.
const FIELDS = ['Title', 'Research request', 'Style direction', 'Reference links', 'Reference files', 'Reference videos', 'Research brief', 'Sources',
  'Format', 'Slide size', 'Slide count', 'Niche', 'Narrative prompt', 'Format prompt', 'Image style', 'Angle', 'Cover reference images', 'Cover reference use', 'Slide reference images', 'Text style reference', 'Copy from reference', 'Text style', 'Handle / series label', 'Editable slides',
  'Reference slideshow links', 'Platforms', 'Instagram as', 'Posting mode', 'Post time', 'Slides', 'Post caption', 'Hashtags', 'Music', 'Music URL (for video)',
  'Drive folder', 'Slideshow video', 'Posting log', 'Asset manifest', 'Status'];
const norm = k => String(k).toLowerCase().replace(/\s+/g, ' ').trim();
// Fields you renamed to something clearer (your name → the name the workflow uses)
const ALIASES = {
  'copy from text style reference': 'Copy from reference',
  'content research': 'Research request',
  'content research reference links': 'Reference links',
  'content research reference files': 'Reference files',
  'content research brief': 'Research brief',
};
// names: the workflow's name for a field → its name in your table (used when writing back)
const names = {};
for (const key of Object.keys(row)) {
  const canon = FIELDS.find(f => norm(f) === norm(key)) || ALIASES[norm(key)];
  if (canon && canon !== key && row[canon] === undefined) { row[canon] = row[key]; names[canon] = key; }
}
const nm = f => names[f] || f;
const rowId = Number(q.row || row.id);

const LABEL = {
  research: ['Brainstorm', 'about 3-6 minutes'],
  plan: ['Post Creation Plan', 'about 1 minute'],
  slides: ['Draft text', 'about 1 minute'],
  redo: ['Slide redo', 'about 2-4 minutes'],
  images: ['Style preview', 'about 1 minute'],
  look: ['Other slides', 'about 2-5 minutes'],
  finalize: ['Save post', 'about 2-6 minutes'],
};

let problem = '';
if (!LABEL[action]) problem = `Unknown action "${action}".`;
else if (!row || !row.id) problem = `Row ${q.row} wasn't found in the Content table. Check contentTableId in the n8n Config node.`;
else if (!txt(row.Title)) problem = 'Give the row a Title (your research topic) first.';
else if (['plan', 'slides'].includes(action) && !txt(row['Research brief'])) problem = `Run step 1 (▶ Brainstorm) first: the ${nm('Research brief')} is empty.`;
else if (['redo', 'finalize', 'images', 'look'].includes(action) && !linkIds(row.Slides).length) problem = 'There are no slides yet. Approve the Post Creation Plan first (▶ Approve → create draft text).';

const label = LABEL[action] ? LABEL[action][0] : action;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (icon, title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f6f6f4;color:#222;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{background:#fff;border-radius:14px;padding:28px 32px;max-width:460px;box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-size:20px;margin:0 0 10px}p{line-height:1.5;margin:8px 0;color:#444}</style></head>
<body><div class="c"><h1>${icon} ${esc(title)}</h1>${body}</div></body></html>`;

const html = problem
  ? page('⚠️', `Can't start: ${label}`, `<p>${esc(problem)}</p>`)
  : page('✅', `${label} started`, `<p>“${esc(txt(row.Title))}”</p><p>Baserow will update when it's done (${LABEL[action][1]}). You can close this tab.</p><p>If the Status stays on “…” for more than 10 minutes, check Executions in n8n.</p>`);

// The Status shown while this step runs (set by "Baserow: Set Status")
const STATUS = { research: 'Brainstorming…', plan: 'Filling plan…', slides: 'Writing text draft…', redo: 'Redoing draft images…', images: 'Making draft images…', look: 'Making draft images…', finalize: 'Finalising draft post…' };

return [{ json: { ok: !problem, action, rowId, row, names, html, status: STATUS[action] || '', patchUrl: rowUrl(T.content, rowId) } }];
