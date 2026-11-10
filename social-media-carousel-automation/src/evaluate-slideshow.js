const MAX_CHECKS = 60; // 60 × 15 s = 15 minutes
const r = $input.first().json;
if (r.status === 'failed') throw new Error('Slideshow render failed: ' + (r.error_message || 'no message'));
const done = r.status === 'succeeded';
if (!done && $runIndex + 1 >= MAX_CHECKS) throw new Error('Timed out waiting for the slideshow video (last status: ' + r.status + ')');
return [{ json: { done, url: r.url || null, status: r.status } }];
