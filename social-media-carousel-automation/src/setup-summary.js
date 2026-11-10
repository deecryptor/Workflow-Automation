// Collects table IDs and select-option IDs for the Carousel Automation's Config node.
const spec = $('Field Specs').all().map(i => i.json);
const created = $('Baserow: Create Field').all().map(i => i.json);
const failed = created.map((c, i) => (c && c.id ? null : `${spec[i].name}: ${JSON.stringify(c).slice(0, 200)}`)).filter(Boolean);

const selectOptions = {};
created.forEach(c => {
  if (c && Array.isArray(c.select_options) && c.select_options.length) {
    selectOptions[c.name] = Object.fromEntries(c.select_options.map(o => [o.value, o.id]));
  }
});
const tables = spec[0].tables;
const result = {
  databaseId: spec[0].databaseId,
  contentTableId: tables.content,
  slidesTableId: tables.slides,
  selectOptions: JSON.stringify(selectOptions),
  fieldsCreated: created.length - failed.length,
  fieldErrors: failed,
};
const ok = !failed.length;
return [{
  json: {
    ...result,
    completionTitle: ok ? '✅ Carousel Automation tables are ready' : '⚠️ Tables created with some errors',
    completionMessage: [
      `Database "Carousel Automation" created with tables Content (${tables.content}) and Slides (${tables.slides}).`,
      ok ? `All ${result.fieldsCreated} fields were added, plus an example Content row.` : `Problems: ${failed.join(' | ')}`,
      'Next: 1) in Baserow open Settings → Database tokens and create a token for this database; 2) in the main workflow, open the Config node and paste contentTableId, slidesTableId and selectOptions from this run\'s Summary node.',
    ].join('\n\n'),
  },
}];
