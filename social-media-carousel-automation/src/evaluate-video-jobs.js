// @include helpers
// @include video
// Updates each Magica job from its run status. A finished download sends the video to Qwen (OpenRouter), then Gemini.
// Long transcripts/documents get full-coverage research notes (DeepSeek, then Gemini) before Claude sees them.
const row = $('Check Action').first().json.row || {};

const MAX_CHECKS = 60; // 60 × 15 s = 15 minutes (long podcasts take a while)
const state = $('Wait for Magica').first().json;
const jobs = state.jobs.map(j => ({ ...j }));
const checks = $('Explode Magica Checks').all().map(i => i.json);
const runs = $input.all().map(i => i.json);

checks.forEach((c, i) => {
  if (c.idx < 0) return;
  const j = jobs[c.idx]; const run = runs[i] || {};
  const status = String(run.status || '').toUpperCase();
  if (['FAILED', 'CANCELED', 'CANCELLED', 'ERROR'].includes(status)) return advanceJob(j, run.userMessage || run.error || status);
  if (status !== 'COMPLETED') return;
  const a = j.attempts[j.step];
  if (a.then === 'gemini') {
    const url = findUrl(run.output, /^https?:\/\/\S+/i) || findUrl(run.response, /^https?:\/\/\S+/i);
    if (!url) return advanceJob(j, 'download returned no video URL');
    // Qwen / Gemini on OpenRouter first (unless they already tried this video), then Gemini on Magica
    const triedOr = j.attempts.some(x => x.provider === 'openrouter' && x.task === 'video');
    const next = [...(triedOr ? [] : orVideo(url)), { nodeType: cfg.videoModel || 'gemini_3_8_flash', input: { prompt: VIDEO_PROMPT, video_urls: [url], max_tokens: 16000, temperature: 0.2 } }];
    j.attempts.splice(j.step + 1, 0, ...next);
    j.step++; j.runId = null; j.status = 'pending';
    return;
  }
  // Guard: if Magica dropped the video (bad URL), Gemini answers anyway and invents a video. Reject that.
  for (const key of ['video_urls', 'image_urls', 'file_urls']) {
    if (a.input && a.input[key]) {
      const got = run.input ? (Array.isArray(run.input[key]) ? run.input[key].filter(Boolean) : []) : null;
      if (got && !got.length) return advanceJob(j, `Gemini did not receive the ${key.split('_')[0]}`);
    }
  }
  finishJob(j, a, findText(run.output) || findText(run.response), row);
});

const open = jobs.filter(j => ['pending', 'running'].includes(j.status));
if (open.length && $runIndex + 1 >= MAX_CHECKS) open.forEach(j => {
  // a summary that runs out of time keeps the full transcript it was summarising
  if (j.attempts[j.step] && j.attempts[j.step].condense) { j.status = 'done'; j.error = 'notes timed out, used the full text instead'; return; }
  j.status = j.fallbackText ? 'done' : 'failed'; if (j.fallbackText) { j.text = j.fallbackText; j.via = j.fallbackVia; } j.error = 'timed out after 15 minutes';
});
const allDone = jobs.every(j => ['done', 'failed'].includes(j.status));
return [{ json: { jobs, skipped: state.skipped, allDone } }];
