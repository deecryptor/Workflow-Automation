// @include helpers
const { row, patchUrl } = ctx();
const job = $('Collect Render Job').first().json;
const cost = $('Collect Images').all().reduce((a, i) => a + (i.json.cost || 0), 0);
const costText = `$${cost.toFixed(2)} OpenRouter`;
const action = ctx().action;
const preview = action === 'images' && job.slides.length === 1 && Number(row['Slide count'] || 2) > 1;
// "Style preview ready" once you add it to Status; until then "Draft image ready"
const hasPreviewStatus = !!(OPT.Status && OPT.Status['Style preview ready'] !== undefined);
const status = preview ? (hasPreviewStatus ? 'Style preview ready' : 'Draft image ready') : action === 'redo' ? 'Draft images redone' : 'Draft image ready';
const body = { Status: opt('Status', status) };
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
// ⚠️ lines from the image check (app UI, borders, collages, wrong text)
const checks = $('Collect Image Checks').isExecuted ? ($('Collect Image Checks').first().json.warnings || []) : [];
const checkText = checks.length ? '\n' + checks.join('\n') : '';
const anchor = $('Pick Style Anchor').isExecuted ? $('Pick Style Anchor').first().json : {};
const what = preview
  ? `style preview made (slide ${job.slides[0].n}). Check its look in the Slides table${String(cfg.textMode || 'pptx') !== 'image' ? ' and the Editable slides file' : ''}. Like it? Press ▶ Approve look → make the other slides. If not, edit Image style / Text style or that slide's Redo note, then press ↻ Redo style preview`
  : action === 'look' ? `made the other ${job.slides.length} slides${anchor.n ? `, matching slide ${anchor.n}` : ''}. Not happy with some? Tick Redo on them and press ↻ Redo images. All good? Press ▶ Approve draft images`
    : action === 'images' ? `images made for ${job.slides.length} slides`
      : `redid slides ${job.slides.map(s => s.n).join(', ')}${anchor.n ? ` (matching slide ${anchor.n})` : ''}. All good? Press ▶ Approve draft images`;
body['Posting log'] = `${stamp} UTC · ${what} · ${costText}${checkText}\n${txt(row['Posting log'])}`.trim();
return [{ json: { url: patchUrl, body } }];
