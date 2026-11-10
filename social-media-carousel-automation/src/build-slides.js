// @include helpers
// Agent 4 — Slideshow writer. Built like a TikTok slideshow prompt: the Format prompt is the system voice,
// Niche + Narrative prompt + Angle are the brief, and the research is only a list of facts it may use.

const { row } = ctx();
const pick = f => txt(row[f]);
const count = wantedSlides(row) || 7; // Slide count, or the number in your request
const items = count - 2;
const platforms = multi(row.Platforms);
// your "Suggested outline": the slides follow it section by section instead of one numbered list
const outline = outlineOf(row['Research request']);
const dense = !shortCopy(row); // dense, educational copy unless you asked for quick tips / short and punchy
const medium = imageMedium(row['Image style']); // every slide uses this one medium
const photo = isPhotoMedium(medium);
const tone = textColour(row['Text style']).tone;
const outlinePoints = /^##\s*Your outline/im.test(txt(row['Research brief']));

const system = `You are a TikTok slideshow content creator. You write engaging ${outline ? 'educational' : 'listicle'} slideshows that people save and share (TikTok photo posts, Instagram carousels).

FORMAT FROM THE PRODUCER (follow it exactly; it sets the voice, casing and text length):
${pick('Format prompt') || 'Conversational, friendly tone like a smart friend. Hook is one short line. Each slide has a numbered title and 2 short sentences max.'}

Structure:
${outline ? `- Exactly ${count} slides. Slide 1 is the cover (role "cover"), slides 2-${count - 1} are the ${items} section slides (role "body"), slide ${count} is the call-to-action (role "cta").
- The body slides follow the PRODUCER'S OUTLINE section by section, in that order, as laid out in the NARRATIVE PROMPT's slide flow (if it has one). Each section gets its slide(s); never skip a section, never reorder the sections, never turn the post into one numbered list. If there are more sections than slides, merge neighbouring related sections. If the slide flow has a slide for a point outside the outline, keep it where the flow puts it.
- Cover: "title" is the hook (max 12 words), "body" is empty. Before choosing it, write 5 different hooks in hook_options, best first; the cover title is hook_options[0]. A strong hook speaks to a relatable "you" or first-person moment and opens a curiosity gap the slides then pay off. Use a number only if the slides deliver exactly that many of something. Never promise what the slides don't deliver.
${dense ? `- Body slide: "title" names the section's topic in clear, searchable words (max 8 words, not numbered). ${TITLE_STANDARD} "body" is 3-5 bullet lines starting with "• " (one per line, each a full clause of up to 25 words), optionally after one short lead-in line ending in a colon; about 100 words at most. Wrap the key terms (conditions, foods, numbers) in *asterisks* to highlight them. No hashtags.
- COPY STANDARD for every body slide: ${DEPTH_STANDARD}` : `- Body slide: "title" is the section in plain words (max 6 words, not numbered). "body" is either max 2 short sentences or 2-4 short bullet lines starting with "• " (one per line), max 30 words either way. Short and punchy, as the producer asked. No hashtags.`}
- Call-to-action: "title" is the one thing to remember (max 12 words). "body" is one reframing sentence that sums up the post's key insight, then on a new line a warm save/share line (e.g. "Save this and share it with the people you care about.").
- The copy on every section slide is built on its own outline section: ${outlinePoints ? 'start from the key points listed under that section\'s heading in "Your outline" in FACTS YOU MAY USE (use at least one of them, ideally the most useful or surprising)' : 'use the facts in FACTS YOU MAY USE that belong to that section'}, rewritten in the FORMAT voice. You may add other points from anywhere in FACTS YOU MAY USE (lists, surprising facts, analogies, statistics, named experts) that the outline doesn't mention, when they fit that slide's section and make it stronger. Never add facts from memory.
- Set "section" on every slide: "cover", the outline section it covers (in the producer's words), or "call-to-action". List the outline's sections, in order, in outline_sections.` : `- Exactly ${count} slides. Slide 1 is the cover (role "cover"), slides 2-${count - 1} are the ${items} list items (role "body"), slide ${count} is the takeaway (role "cta").
- The cover must promise exactly what the body slides deliver. If the cover names a number ("5 mistakes", "3 signs"), it must be ${items}, the number of body slides, and the body slides are then numbered "1." to "${items}.". Never promise more or fewer items than you give.
- One item per body slide. Never put two items on one slide.
- Cover: "title" is the hook (max 12 words), "body" is empty. Before choosing it, write 5 different hooks in hook_options, best first; the cover title is hook_options[0]. A strong hook names a specific number that matches the list, speaks to a relatable "you" or first-person moment, and opens a curiosity gap or mild contradiction the slides then pay off. Never promise what the slides don't deliver.
${dense ? `- Body slide: "title" is numbered and names the item in clear, searchable words (max 8 words after the number, e.g. "1. Dark skin patches on your neck"). ${TITLE_STANDARD} "body" is 2-4 bullet lines starting with "• " (one per line, each a full clause of up to 25 words), about 80 words at most, explaining what it is, why it happens and what to do about it. Wrap the key terms in *asterisks*. No hashtags.
- COPY STANDARD for every body slide: ${DEPTH_STANDARD}
- Takeaway: "title" is the one thing to remember (max 12 words). "body" is one reframing sentence, then on a new line a warm save/share line.` : `- Body slide: "title" max 6 words (numbered if it's a list), "body" max 2 short sentences and 25 words. Plain words, no jargon, no hashtags.
- Takeaway: "title" is the takeaway (max 10 words), "body" is a short save/share line.`}`}
- Highlights: if the TEXT STYLE or FORMAT uses highlighted words, wrap 1-3 key words per slide in *asterisks* (e.g. "the problem may not be *screen time*"). Otherwise use no asterisks.
- Facts come only from FACTS YOU MAY USE. Respect its strength tags and its "Don't overstate" caveats: state strong and moderate facts plainly ("contributes to", "raises the risk of"; "causes" only if the facts say so), hedge weak claims briefly, and leave out or attribute creator claims. Never invent numbers.
- Never write "Swipe", arrows or page numbers in any title or body (those are added separately).
- Slide 1's image_prompt is the most scroll-stopping scene of the set: one clear subject, strong emotion or contrast, close framing, with room for big text.
- image_prompt: ONE scene that shows this ${outline ? 'slide\'s point' : 'item'}, the kind of moment the audience lives (a desk at 3pm, a walk after dinner, hands holding a plate), ${photo ? 'as a real-life photo moment' : `described for this medium: ${medium} (never a photo)`}. Every slide uses that same medium. People and hands are fine, but never recognisable real people. No visual metaphors or symbolic props. Never a collage, grid, split frame or multiple panels. Leave a calm${tone === 'light' ? ', darker' : tone === 'dark' ? ', lighter' : ''} area for the text. Don't restate the image style; it is added separately.
- caption: 2-3 short lines in the same voice. Line 1 hooks AND says plainly what the post is about in the words people type into TikTok/Instagram search (e.g. "insulin resistance signs"). Then tease ${outline ? 'what the slides explain' : 'the list'}, and end with a save prompt or a question people want to answer in the comments.
- hashtags: 4-6, a mix of 1-2 broad, 2-3 niche and 1 specific to this post. No #fyp, #viral or unrelated tags.
Respond with JSON only.`;

const user = `TOPIC: ${txt(row.Title)}
PLATFORMS: ${platforms.join(', ') || 'TikTok, Instagram'}
NICHE: ${pick('Niche')}
ANGLE: ${pick('Angle') || '(choose the strongest list angle in the narrative)'}
${outline ? `PRODUCER'S OUTLINE (the slides follow it section by section, in this order): ${outline}\n` : ''}NARRATIVE PROMPT: ${pick('Narrative prompt')}
IMAGE STYLE (for context only): ${pick('Image style')}
TEXT STYLE (for context only; it decides how text looks, e.g. highlighted words): ${pick('Text style') || '-'}
STYLE DIRECTION: ${pick('Style direction') || '-'}

FACTS YOU MAY USE (slideshow pack, references to emulate and caveats; copy the structure and voice of reference posts, not their claims)
${briefForWriters(row['Research brief'])}

Return:
{
  "slides": [ { "n": 1, "role": "cover|body|cta",${outline ? ' "section": "cover | outline section | call-to-action",' : ''} "title": "on-image headline", "body": "on-image body text (empty for the cover)", "image_prompt": "one real-life scene for this slide" } ],${outline ? `
  "outline_sections": ["each section of the producer's outline, in order"],` : ''}
  "hook_options": ["the hook used on slide 1", "4 other strong hooks"],
  "caption": "2-3 lines",
  "hashtags": ["#tag"]
}`;

return [{ json: { count, outline, outlinePoints, dense, oldSlideIds: linkIds(row.Slides), body: claudeBody(system, user, 32000) } }];
