// @include helpers
// Step 4a: the slide text is written and saved. No images yet: review each slide's Title, Body Text and Image prompt
// (scene + text design) in the Slides table, plus the caption and hashtags, then press "Approve draft text → make draft images".
const { patchUrl } = ctx();
const { copy, requested, warning, hooks } = $('Parse Slides').first().json;
const made = ($('Baserow: Create Slides').first().json.items || []).length;
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const hookText = hooks && hooks.length ? `\nOther hooks you could use (put one in slide 1's Title):\n${hooks.map(h => `• ${h}`).join('\n')}` : '';
const body = {
  Status: opt('Status', 'Draft text ready'),
  'Posting log': `${stamp} UTC · ${made} slides written (asked for ${requested}). Review each slide's Title, Body Text and Image prompt (scene + text design) in the Slides table, and the caption and hashtags, then press ▶ Approve draft text → make style preview.${warning ? '\n' + warning : ''}${hookText}`,
};
if (copy['Post caption']) body['Post caption'] = copy['Post caption'];
if (copy.Hashtags) body.Hashtags = copy.Hashtags;
return [{ json: { url: patchUrl, body } }];
