// What each reference said, for the research brief.
const { jobs, skipped } = $input.first().json;
const notes = jobs.map(j => ({ label: j.label, url: j.url, kind: j.kind, fileKind: j.fileKind, ok: j.status === 'done', via: j.via, text: j.text, error: j.error }));
return [{ json: { notes, skipped: skipped || [] } }];
