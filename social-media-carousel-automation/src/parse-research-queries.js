// @include helpers
const plan = extractJson(claudeText($input.first().json));
const qs = (plan.queries || []).filter(q => q && txt(q.query)).slice(0, outlineOf(ctx().row['Research request']) ? 8 : 6);
if (!qs.length) throw new Error('Research planner returned no queries: ' + JSON.stringify(plan).slice(0, 300));
return qs.map(q => ({ json: { query: txt(q.query), purpose: q.purpose || '', topic: q.topic === 'news' ? 'news' : 'general' } }));
