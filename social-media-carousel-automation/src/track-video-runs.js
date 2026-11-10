// @include helpers
// @include video
// Records the run IDs Magica returned. A start that failed moves that job to its next attempt.
const state = $('Reference Jobs To Run').first().json;
const starts = state.starts;
const jobs = state.jobs.map(j => ({ ...j }));
$input.all().forEach((it, i) => {
  const j = jobs[starts[i].idx];
  if (it.json && it.json.runId) { j.runId = it.json.runId; j.status = 'running'; }
  else advanceJob(j, 'could not start: ' + JSON.stringify(it.json || {}).slice(0, 600));
});
return [{ json: { jobs, skipped: state.skipped } }];
