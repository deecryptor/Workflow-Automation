// Records the YouTube outcome (or that YouTube wasn't needed) and passes the plan on.
const r = $('Post Router').first().json;
const log = [...r.log];
if ($('YouTube: Upload Short').isExecuted) {
  const y = $('YouTube: Upload Short').first().json || {};
  const id = y.id || y.uploadId;
  const p = $('Finalize Plan').first().json;
  log.push(`YouTube: uploaded as a PRIVATE Short${id ? ` (https://youtu.be/${id})` : ''}. ${p.mode === 'Save drafts only' ? 'Review it in YouTube Studio and publish when ready.' : 'Uploads from an unaudited Google project stay private, so open YouTube Studio to publish or schedule it.'}`);
}
return [{ json: { ...r, log } }];
