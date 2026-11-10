// @include helpers
const r = $('After YouTube').first().json;
return [{ json: { source: 'finalize', rowId: ctx().rowId, manifest: r.manifest, igAs: r.igAs } }];
