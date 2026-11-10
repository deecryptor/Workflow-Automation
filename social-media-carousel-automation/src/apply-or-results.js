// @include helpers
// @include video
// Stores each OpenRouter answer. A failed or empty answer moves that job to its next attempt (ending with Magica).
const row = $('Check Action').first().json.row || {};
const state = $('Reference Jobs To Run').first().json;
const jobs = state.jobs.map(j => ({ ...j }));
const calls = $('Explode OpenRouter Calls').all().map(i => i.json);
const res = $input.all().map(i => i.json || {});
calls.forEach((c, i) => {
  const j = jobs[c.idx]; const a = j.attempts[j.step];
  if (c.skip) return advanceJob(j, `OpenRouter skipped (${c.skip})`);
  const r = res[i] || {};
  const ch = r.choices && r.choices[0];
  const err = r.error ? (r.error.message || JSON.stringify(r.error)) : (!ch ? 'no answer: ' + JSON.stringify(r).slice(0, 300) : '');
  if (err) return advanceJob(j, `OpenRouter ${modelLabel(a.model)}: ${String(err).slice(0, 300)}`);
  const m = ch.message || {};
  const text = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('\n') : '';
  if (!text.trim()) return advanceJob(j, `${modelLabel(a.model)} returned no text${ch.finish_reason === 'length' ? ' (ran out of room)' : ''}`);
  finishJob(j, a, text, row);
});
return [{ json: { jobs, skipped: state.skipped } }];
