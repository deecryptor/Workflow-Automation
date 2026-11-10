// @include helpers
// @include video
// Agent 1 — Research lead: plans web searches from the topic, your request and any reference links.

const { row } = ctx();
// Tavily reads article links; videos, podcasts, social posts and files are read separately through Magica.
const allLinks = splitLinks(row['Reference links']);
const links = allLinks.filter(u => refKind(u) === 'article');
const videoLinks = allLinks.filter(u => refKind(u) !== 'article');
const nFiles = ['Reference files', 'Reference videos'].reduce((n, f) => n + (Array.isArray(row[f]) ? row[f].length : 0), 0);

const system = [
  'You are the research lead for a social media studio that makes educational carousels and slideshows (TikTok photo posts, Instagram carousels).',
  'Plan web searches that surface what makes carousels get saved and shared: clear facts, surprising numbers, myths vs reality, relatable examples, practical takeaways, real expert disagreement, lists of items a slideshow can be built on (signs, habits, mistakes, myths), and the words the audience itself uses.',
  'Respond with JSON only.',
].join('\n');

const outline = outlineOf(row['Research request']);
const user = `Topic: ${txt(row.Title)}
What the producer wants: ${txt(row['Research request']) || '(no extra description)'}
${outline ? `The producer's outline (the research must cover every section of it): ${outline}\n` : ''}${ownAngle(row) ? `The producer's chosen angle (aim the searches at it): ${ownAngle(row)}\n` : ''}Reference links the producer supplied (they will be read separately): ${links.length ? links.join(', ') : 'none'}
Other references (videos, podcasts, posts, files — read separately): ${videoLinks.length + nFiles ? [...videoLinks, nFiles ? nFiles + ' uploaded file(s)' : ''].filter(Boolean).join(', ') : 'none'}
Today's date: ${new Date().toISOString().slice(0, 10)}

${outline ? `Plan 6-8 web searches. First, at least one search per section of the producer's outline, in their order (merge two closely related sections into one search only if needed to stay within 8); for each, find how and why it happens (the mechanism), the specific conditions, signs or causes involved, concrete guideline numbers (amounts, minutes, frequency, timeframes), named expert concepts, key facts, numbers and expert views for each. Then use any searches left for these:` : 'Plan 5 web searches, one per angle:'}
1. Core explanation and the latest developments ("news" if time-sensitive)
2. Listable items with evidence for the producer's angle if given, else the post they want (signs, habits, mistakes or myths; if they didn't say, the most useful list), including surprising numbers from studies
3. Common myths or misconceptions and what is actually true
4. How real people describe it in their own words: forum threads, Reddit, comments, personal stories (to learn the audience's phrases, not as evidence)
5. Practical, evidence-based takeaways and any expert debate

Return: { "queries": [ { "query": "3-10 words", "purpose": "what it should find", "topic": "general" | "news" } ] }`;

return [{ json: { links, body: claudeBody(system, user, 4000) } }];
