// @include helpers
// Final write-back to the Content row, for both the step-4 button and the scheduler.
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const igDone = $('IG: Result').isExecuted ? $('IG: Result').first().json : null;

if ($('IG Start').isExecuted && $('IG Start').first().json.source === 'schedule') {
  const job = $('IG Start').first().json;
  const manifest = { ...job.manifest, ig_posted: true, ig_media_id: igDone && igDone.igMediaId };
  return [{
    json: {
      url: rowUrl(T.content, job.rowId),
      body: {
        Status: opt('Status', 'Posted'),
        'Asset manifest': JSON.stringify(manifest),
        'Posting log': `${stamp} · Instagram: posted on schedule as a ${job.igAs} (media id ${igDone && igDone.igMediaId}).\n${job.existingLog}`.trim(),
      },
    },
  }];
}

const r = $('After YouTube').first().json;
const p = $('Finalize Plan').first().json;
const log = [...r.log];
const manifest = { ...r.manifest };
if (igDone) { log.push(`Instagram: posted as a ${igDone.igAs} (media id ${igDone.igMediaId}).`); manifest.ig_posted = true; manifest.ig_media_id = igDone.igMediaId; }

let status = 'Draft post saved';
if (p.mode === 'Post now' && (igDone || $('YouTube: Upload Short').isExecuted)) status = 'Posted';
if (r.igPlan === 'scheduled') status = 'Scheduled';

return [{
  json: {
    url: ctx().patchUrl,
    body: {
      Status: opt('Status', status),
      'Drive folder': r.folderUrl,
      'Slideshow video': r.videoUrl || '',
      'Asset manifest': JSON.stringify(manifest),
      'Posting log': [`${stamp} · Saved ${p.slides.length} slides${r.videoUrl ? ' + slideshow video' : ''} + caption.txt to Google Drive: ${r.folderUrl}`, ...log].join('\n'),
    },
  },
}];
