// Builds every field the Carousel Automation needs, in creation order.
const db = $('Baserow: Create Database').first().json;
const content = $('Create Table: Content').first().json.id;
const slides = $('Create Table: Slides').first().json.id;
const hook = String($('Setup Form').first().json['n8n address'] || 'http://localhost:5678').replace(/\/+$/, '') + '/webhook/carousel-automation';

const colors = ['light-blue', 'light-green', 'light-orange', 'light-purple', 'light-red', 'light-gray', 'light-yellow', 'light-cyan', 'light-pink', 'light-brown', 'blue', 'green'];
const options = values => values.map((value, i) => ({ value, color: colors[i % colors.length] }));
const button = (action, label) => ({
  type: 'formula',
  formula: `button(concat('${hook}?action=${action}&row=', totext(row_id())), '${label}')`,
});

const RESEARCH_HELP = `One item per line, each starting with a label (see docs/how-to-write-content-research.md):
Topic: …
Audience: …
Post I want: …
Suggested outline: section 1, section 2, …  (optional)
Optional pool (not must-cover): …`;

const F = [];
const add = (table, name, spec) => F.push({ json: { table, name, body: { name, ...spec } } });

// ---- Content: status ----
add(content, 'Status', {
  type: 'single_select', select_options: options([
    'New', 'Brainstorming…', 'Summary ready', 'Filling plan…', 'Plan ready', 'Writing text draft…', 'Draft text ready',
    'Making draft images…', 'Style preview ready', 'Draft image ready', 'Redoing draft images…', 'Draft images redone',
    'Finalising draft post…', 'Draft post saved', 'Needs attention',
  ]),
});
// ---- step 1: gather content & design requirements → Brainstorm ----
add(content, 'Content Research', { type: 'long_text', description: RESEARCH_HELP });
add(content, 'Content Research Reference Links', { type: 'long_text', description: 'One link per line: articles, YouTube, Instagram/TikTok/X posts.' });
add(content, 'Content Research Reference Files', { type: 'file', description: 'PDFs, videos, images, audio or .txt transcripts.' });
add(content, 'Angle', { type: 'long_text', description: 'Optional. Write your own hook before Brainstorm to aim the research at it; otherwise a suggested angle is written here.' });
add(content, 'Style Direction', { type: 'long_text', description: 'Voice and look for the post.' });
add(content, '1 · Gather Content & Design Requirements', button('research', '▶ Brainstorm'));
// ---- step 2: brainstorming summary → fill plan ----
add(content, 'Content Research Brief', { type: 'long_text' });
add(content, 'Sources', { type: 'long_text' });
add(content, 'Research cache', { type: 'long_text', description: 'Filled by the workflow; you can hide it. Lets Brainstorm rewrite only the summary after a failure. Clear it to force fresh research.' });
add(content, '2 · Brainstorming Summary', button('plan', '▶ Approve summary → fill plan'));
// ---- step 3: post creation plan → draft text ----
add(content, 'Slide size', { type: 'single_select', select_options: options(['4:5 (Instagram + TikTok)', '9:16 (TikTok, Reels, Shorts)', 'Both (4:5 + 9:16)']) });
add(content, 'Slide count', { type: 'number', number_decimal_places: 0 });
add(content, 'Niche', { type: 'long_text' });
add(content, 'Narrative prompt', { type: 'long_text' });
add(content, 'Format prompt', { type: 'long_text' });
add(content, 'Image style', { type: 'long_text' });
add(content, 'Cover reference images', { type: 'file' });
add(content, 'Cover reference use', { type: 'single_select', select_options: options(['Match the look', 'Recreate the scene (same person)']) });
add(content, 'Slide reference images', { type: 'file' });
add(content, 'Text style reference', { type: 'file', description: 'Optional. 1-2 slides whose TEXT styling you want to copy (font, colours, effects, placement). The picture itself is not copied.' });
add(content, 'Copy from text style reference', { type: 'multiple_select', select_options: options(['Font', 'Colours', 'Text effects', 'Layout & placement', 'Extras']) });
add(content, 'Text style', { type: 'long_text' });
add(content, 'Handle / series label', { type: 'text', description: 'Optional. Your own handle or series name, written small on every slide. Empty = none.' });
add(content, 'Reference slideshow links', { type: 'long_text' });
add(content, '3 · Post Creation Plan', button('slides', '▶ Approve → create draft text'));
// ---- step 4: draft text → style preview ----
add(content, 'Slides', { type: 'link_row', link_row_table_id: slides, has_related_field: true });
add(content, 'Post caption', { type: 'long_text' });
add(content, 'Hashtags', { type: 'long_text' });
add(content, '4 · Draft Text', button('images', '▶ Approve draft text → make style preview'));
// ---- step 5: style preview → the other slides ----
add(content, 'Redo style preview', button('images', '↻ Redo style preview'));
add(content, '5 · Style Preview', button('look', '▶ Approve look → make the other slides'));
// ---- step 6: draft images → save ----
add(content, 'Redo images', button('redo', '↻ Redo images'));
add(content, '6 · Draft Images', button('finalize', '▶ Approve draft images'));
// ---- step 7: saved draft ----
add(content, '7 · Saved Finalised Drafts', { type: 'formula', formula: "''" }); // section heading only
add(content, 'Editable slides', { type: 'file', description: 'The .pptx with editable text over the slide art.' });
add(content, 'Drive folder', { type: 'url' });
add(content, 'Posting log', { type: 'long_text' });
add(content, 'n8n run', { type: 'text' });

// ---- Slides ---- ("Content" link is created automatically by the Slides link above)
add(slides, 'Slide #', { type: 'number', number_decimal_places: 0 });
add(slides, 'Role', { type: 'single_select', select_options: options(['cover', 'body', 'cta']) });
add(slides, 'Title', { type: 'text' });
add(slides, 'Body text', { type: 'long_text' });
add(slides, 'Image prompt', { type: 'long_text' });
add(slides, 'Image', { type: 'file' });
add(slides, 'Image URL', { type: 'url' });
add(slides, 'Redo', { type: 'boolean', description: 'Tick, then press ↻ Redo images on the Content row.' });

return F.map(f => ({ json: { ...f.json, databaseId: db.id, tables: { content, slides } } }));
