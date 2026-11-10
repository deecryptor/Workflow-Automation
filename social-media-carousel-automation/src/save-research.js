// @include helpers
const brief = claudeText($input.first().json).trim();
const src = $('Load Saved Research').first().json.use ? $('Load Saved Research').first().json : $('Build: Research Brief Request').first().json;
const { sourcesText } = src;
const row = ctx().row || {};
const nm = f => (ctx().names || {})[f] || f; // your table's name for the field
// the suggested angle goes into Angle for you to review, unless you wrote your own there
// (a suggestion left from the last Brainstorm is replaced)
const angle = suggestedAngle(brief);
return [{
  json: {
    url: ctx().patchUrl,
    body: {
      [nm('Research brief')]: brief, Sources: sourcesText, Status: opt('Status', 'Summary ready'),
      ...('Research cache' in row ? { 'Research cache': '' } : {}),
      ...(angle && !ownAngle(row) && 'Angle' in row ? { Angle: angle } : {}),
    },
  },
}];
