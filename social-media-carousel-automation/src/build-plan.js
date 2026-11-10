// @include helpers
// Agent 3 — Creative strategist: picks ONE list angle from the research and writes the four directions the
// slide writer and image model follow (Niche, Narrative prompt, Format prompt, Image style), in the shape of
// the TikTok slideshow examples below. Only empty fields are filled, so anything you typed is kept.
// Clear a field to have it rewritten.

const { row } = ctx();
const platforms = multi(row.Platforms);
const PLAN_FIELDS = ['Niche', 'Narrative prompt', 'Format prompt', 'Image style'];
const missing = PLAN_FIELDS.filter(f => !txt(row[f]));
const nCover = fileUrls(row['Cover reference images']).length;
const nSlide = fileUrls(row['Slide reference images']).length;
// your "Suggested outline" in the research request: the post follows it section by section instead of one list
const outline = outlineOf(row['Research request']);
const dense = !shortCopy(row); // dense, educational copy unless you asked for quick tips / short and punchy
const wanted = wantedSlides(row); // the number of slides you asked for (0 = up to the plan)

const system = `You are the creative strategist of a studio that makes TikTok and Instagram photo slideshows that get saved and shared.
You do NOT write the slideshow. You write four short directions that a separate slide writer and image model follow, in the shape of the examples below. Good directions are short, concrete and reusable: they set the angle, the hook style, the voice and the look. They never list slide-by-slide content.

What works: one angle per slideshow, delivered as a list (signs, habits, mistakes, myths, things I wish I knew); a relatable first-person or "you" hook that promises a specific number; one idea per slide; short on-image text (image models garble long text); a takeaway worth saving.${outline ? `
THIS POST IS DIFFERENT: the producer gave an OUTLINE, so it is NOT one list. It follows the outline section by section, in the producer's order, as one story. This overrides the list advice above and the examples' listicle shape.` : ''}

EXAMPLE A (personal finance account)
niche: personal finance, money tips, budgeting
narrative_prompt: Create listicle-style slideshows about personal finance for young women in their 20s-30s. Topics include: money mistakes to avoid, savings tips, budgeting habits, financial mindset shifts, books about money, things I wish I knew earlier about finances. Hook should be relatable and slightly vulnerable (e.g., "i just turned 30", "3 money red flags to avoid in your 20s").
format_prompt: Casual, lowercase text style. Hook is 1-2 short sentences. Each slide has a numbered title and 2 sentences of conversational explanation. Use emojis sparingly (🚩, 😊). Tone is like giving advice to a friend - honest, relatable, not preachy.
image_style: Clean minimal aesthetic, soft natural lighting, lifestyle photography, muted tones, beige and neutral colors, cozy apartment vibes. Single image only. No collages, no grids, no split frames.

EXAMPLE B (corporate career account)
niche: corporate career tips for young professionals
narrative_prompt: Create slideshows about corporate career hacks, workplace habits, and professional tips that make you look more put together, organized, or senior than you actually are. Topics include: productivity habits, communication tricks, organization systems, things that make coworkers respect you more, habits that made a difference in your career. Hook styles: "Corporate hacks that made my coworkers think I'm way more put together than I actually am", "Corporate habits that helped me stand out without saying much", "Things I wish someone told me sooner because they would've saved me YEARS". Target audience: women in their 20s-30s navigating corporate jobs.
format_prompt: Casual, relatable tone like you're sharing secrets with a friend. Lowercase text. Hook is 1-2 short punchy sentences. Each slide has a numbered title (e.g., "1. block your calendar strategically") and 2 sentences max explaining the tip. Include specific, actionable advice. Tone is confident but not preachy - like "this changed everything for me" energy. Generate 5-8 slides per slideshow.
image_style: Professional office aesthetic, warm natural lighting, soft muted tones, beige and cream colors. Scenes include: laptop on a desk, someone writing notes, coffee cup next to a MacBook, a hand on documents in a conference room, a laptop with a calendar open. Clean, aspirational corporate lifestyle photography. Single image only. No collages, no grids, no split frames.

Rules:
${outline ? `- Lay the OUTLINE out as slides: a cover (hook from the producer's ANGLE if given, otherwise the strongest hook in the research), then 1 slide per outline section in the producer's order (2 slides only for a rich section such as signs or what to do), then a last slide from the call-to-action section. N = the number of slides between the cover and the last slide${wanted ? `: exactly ${wanted - 2}, because the producer wants ${wanted} slides in total; merge related sections or split rich ones to fit exactly` : `: as many as the outline needs, up to ${MAX_SLIDES - 2}; merge closely related sections if there are too many`}. Use the research's "Your outline" section for what each slide covers. Points the outline doesn't mention are welcome inside a section's slide; if there is room${wanted ? ' within that number' : ''}, you may also add one slide for a strong point outside the outline (e.g. a surprising fact), placed where it fits the story.` : `- Pick ONE angle: the producer's ANGLE if given, otherwise the strongest angle in the research's Slideshow pack. The angle is a list of N items, ${wanted ? `N = exactly ${wanted - 2} (the producer wants ${wanted} slides in total)` : `N between 4 and ${MAX_SLIDES - 2}, as many as the angle needs`}.`}
- niche: under 15 words: the account's subject plus the specific topic keyword people search, e.g. for a health topic "metabolic health education: insulin resistance explained simply", for a money topic "personal finance basics: credit card debt explained simply" (adapt to this topic).
${outline ? `- narrative_prompt: 100-200 words. What the post is (an information-dense educational carousel people save), the target audience, the hook style with 3 example hooks in the account's voice, the copy standard (${DEPTH_STANDARD}), the title standard (${TITLE_STANDARD}), then "Slide flow:" with every slide in order, e.g. "Slide flow: 1 cover (hook) → 2 Role of insulin → 3 What is insulin resistance → … → 8 save/share call-to-action", using clear, keyword-rich titles built from the producer's section names. No research caveats (the writer gets those separately).
- format_prompt: 50-90 words. The voice (with a short "energy" phrase like the examples), casing, the hook rule (one short line that makes them swipe), ${dense ? 'each slide has a clear title that names the topic (max 8 words, not numbered) and a body of 3-5 bullet lines (each a full clause of up to 25 words, about 100 words in all), optionally after one short lead-in line; key terms highlighted with *asterisks*;' : 'each slide has a short title that names the topic (not numbered) and either max 2 short sentences or 2-4 short bullet lines (max 30 words): short and punchy, as the producer asked;'} the last slide pairs one reframing line with a warm save/share line, and "N section slides plus a cover and a call-to-action slide" (with the real number).` : `- narrative_prompt: ${dense ? '100-180' : '60-120'} words. What to create (${dense ? 'an information-dense list carousel people save: ' : ''}the angle and the pool of items it may draw from), the hook style with 3 example hooks in the account's voice (first person or "you", promising N), and the target audience.${dense ? ` The copy standard (${DEPTH_STANDARD}) and the title standard (${TITLE_STANDARD}).` : ''} No slide-by-slide plan and no research caveats (the writer gets those separately).
- format_prompt: 50-90 words. The voice (with a short "energy" phrase like the examples), casing, the hook rule (one short line that promises N), ${dense ? 'a numbered title that names the item in searchable words (max 8 words, e.g. "1. Dark skin patches on your neck"), a body of 2-4 bullet lines (each a full clause of up to 25 words, about 80 words in all) explaining what it is, why it happens and what to do, key terms highlighted with *asterisks*, the last slide pairs one reframing line with a warm save/share line,' : 'a numbered title example, body max 2 short sentences, the last slide is a one-line takeaway plus a save/share line,'} and "N list slides plus a cover and a takeaway slide" (with the real number).`}
- image_style: 40-90 words. Start with "Medium: " and exactly ONE medium for every slide (e.g. "real-life photograph", "flat vector illustration", "soft 3D illustration", "typographic art on textured paper"). If the style direction offers alternatives ("illustration or typography art"), pick one; never mix media. Then, in the shape of the examples: aesthetic, lighting, palette, 4-6 concrete everyday scenes the audience lives (people or hands are fine, never recognisable real people), and what to avoid. Backgrounds must contrast with the text colour: with light text (e.g. white), the area where text sits is dark or deep; with dark text, it is light. No visual metaphors or symbolic props. End with "Single image only. No collages, no grids, no split frames."
- text_style: 50-90 words of typography instructions for every slide (one text colour for titles and one for body on every slide; bullet markers in the body text colour), ${txt(row['Text style']) || fileUrls(row['Text style reference']).length ? 'or an empty string (the producer already has a text style)' : 'chosen to fit the style direction and image style'}: the font (a real Google Font by name), weights for title and body, case, how much bigger the title is than the body, text and highlight colours as hex, any box, outline or shadow, alignment and where the text sits. No slide words.
- Follow the producer's style direction closely. Stay inside the research's facts and caveats.
Respond with JSON only.`;

const user = `TOPIC: ${txt(row.Title)}
PRODUCER'S REQUEST: ${txt(row['Research request']) || '(none)'}
ANGLE CHOSEN BY THE PRODUCER: ${txt(row.Angle) || '(none: choose the strongest)'}
${outline ? `PRODUCER'S OUTLINE (the post follows it section by section): ${outline}\n` : ''}PLATFORMS: ${platforms.join(', ') || 'not chosen yet'}

STYLE DIRECTION FROM THE PRODUCER (follow it closely; if empty, choose what suits this topic and audience):
${txt(row['Style direction']) || '(none given)'}
Reference slideshow links (inspiration only): ${txt(row['Reference slideshow links']) || '-'}
Reference images uploaded: ${nCover} cover, ${nSlide} slide (the image model will copy their look; describe a style that fits them).

APPROVED RESEARCH (slideshow pack, references and caveats)
${briefForWriters(row['Research brief'])}

TEXT STYLE ALREADY SET (choose image backgrounds that contrast with its text colour): ${txt(row['Text style']) || '(none yet)'}

ALREADY FILLED BY THE PRODUCER (respect these exactly):
${PLAN_FIELDS.filter(f => txt(row[f])).map(f => `${f}: ${txt(row[f])}`).join('\n') || '(nothing yet)'}

Return:
{
  "angle": "${outline ? 'the post in one line: hook idea + that it follows the outline' : 'the chosen angle in one line: hook idea + list type + N'}",
  "item_count": N,
  "niche": "...",
  "narrative_prompt": "...",
  "format_prompt": "...",
  "image_style": "...",
  "text_style": "..."
}`;

return [{ json: { missing, body: claudeBody(system, user, 32000) } }];
