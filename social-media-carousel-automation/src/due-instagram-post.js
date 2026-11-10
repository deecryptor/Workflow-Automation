// Scheduler: finds the earliest post that is due on Instagram. One per run (every 15 min).
const rows = (($input.first().json || {}).results) || [];
const now = Date.now();
const due = rows
  .map(r => {
    let manifest = null;
    try { manifest = JSON.parse(r['Asset manifest'] || 'null'); } catch (e) { manifest = null; }
    return { r, manifest };
  })
  .filter(({ r, manifest }) =>
    ((r.Status && r.Status.value) || r.Status) === 'Scheduled' &&
    (r.Platforms || []).some(p => ((p && p.value) || p) === 'Instagram') &&
    r['Post time'] && new Date(r['Post time']).getTime() <= now &&
    manifest && !manifest.ig_posted && manifest.ig_as)
  .sort((a, b) => new Date(a.r['Post time']) - new Date(b.r['Post time']));
if (!due.length) return [];
const { r, manifest } = due[0];
return [{ json: { source: 'schedule', rowId: r.id, manifest, igAs: manifest.ig_as, existingLog: r['Posting log'] || '' } }];
