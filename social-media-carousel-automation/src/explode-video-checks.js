// One item per running job (or a harmless placeholder so the loop keeps going).
const { jobs } = $input.first().json;
const running = jobs.map((j, idx) => ({ idx, runId: j.runId, status: j.status })).filter(j => j.status === 'running');
if (!running.length) return [{ json: { idx: -1, url: 'https://inference.magica.com/v1/models' } }];
return running.map(r => ({ json: { idx: r.idx, url: 'https://inference.magica.com/v1/nodes/runs/' + r.runId } }));
