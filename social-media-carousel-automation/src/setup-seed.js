// An example Content row, so the table isn't empty.
const tables = $('Field Specs').first().json.tables;
const content = {
  Title: 'What is insulin resistance? (example)',
  'Content Research': [
    'Topic: Insulin resistance',
    "Audience: Working adults 25–55 who think they're healthy because their check-ups are normal. No medical background.",
    'Post I want: An informative post on what insulin resistance is, why it matters and how to reverse it.',
    'Suggested outline: Role of insulin, What is insulin resistance, Health conditions it leads to, Signs and symptoms, How to reverse it, Call-to-action to save and share',
  ].join('\n'),
  'Style Direction': 'Calm, trustworthy health explainer for adults with no medical background. Clean editorial look, warm neutrals with one teal accent, bold readable sans-serif text.',
};
return [{ json: { table: tables.content, body: content } }];
