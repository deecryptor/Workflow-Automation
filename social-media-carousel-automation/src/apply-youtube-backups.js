// @include helpers
// @include video
// Scrape Creators transcripts for the YouTube links Gemini couldn't watch: notes on a long one, else the transcript itself.
const state = $('YouTube Backup?').first().json;
const asks = $('Explode YouTube Backups').all().map(i => i.json);
const res = $input.all().map(i => i.json || {});
const row = $('Check Action').first().json.row || {};
const jobs = state.jobs.map(j => ({ ...j }));
asks.forEach((q, i) => {
  const r = res[i] || {};
  const j = jobs[q.idx];
  const text = String(r.transcript_only_text || '').trim()
    || (Array.isArray(r.transcript) ? r.transcript.map(s => s.text).join(' ').trim() : '');
  if (text.length <= 200) {
    const why = r.error ? (r.error.message || JSON.stringify(r.error)).slice(0, 200) : (r.message || 'no transcript');
    j.error = `${j.error ? j.error + '; ' : ''}Scrape Creators: ${why}`;
    return;
  }
  j.text = text; j.via = "transcript (Gemini couldn't watch it)"; j.error = '';
  if (text.length > LONG_TEXT) { j.status = 'pending'; j.step = 0; j.runId = null; j.attempts = condenseAttempts(j, row); } else j.status = 'done';
});
jobs.forEach(j => { if (j.kind === 'youtube') j.scTried = true; }); // only one backup round
return [{ json: { ...state, jobs } }];
