// Gemini couldn't watch these YouTube links → fetch their transcripts from Scrape Creators (1 credit each).
return $input.first().json.jobs
  .map((j, idx) => ({ j, idx }))
  .filter(({ j }) => j.kind === 'youtube' && j.status === 'failed' && !j.scTried)
  .map(({ j, idx }) => ({ json: { idx, url: j.url } }));
