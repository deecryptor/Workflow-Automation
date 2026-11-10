const r = $input.first().json || {};
if (!r.id) throw new Error('Instagram publish failed: ' + JSON.stringify(r).slice(0, 400));
const job = $('IG Start').first().json;
return [{ json: { igMediaId: r.id, igAs: job.igAs, source: job.source } }];
