// Splits the jobs waiting for their next attempt: OpenRouter calls (answered straight away) and Magica runs (started, then checked).
const state = $input.first().json;
const pending = state.jobs.map((j, idx) => ({ j, idx })).filter(({ j }) => j.status === 'pending');
const orCalls = pending.filter(({ j }) => j.attempts[j.step].provider === 'openrouter').map(({ idx }) => ({ idx }));
const starts = pending
  .filter(({ j }) => j.attempts[j.step].provider !== 'openrouter')
  .map(({ j, idx }) => {
    const a = j.attempts[j.step];
    // the summarising step gets the full text only here, so it isn't carried through every check
    const input = a.condense ? { ...a.input, prompt: a.promptHead + String(j.text).slice(0, 3000000) } : a.input;
    return { idx, nodeType: a.nodeType, body: { input } };
  });
return [{ json: { ...state, orCalls, anyOr: orCalls.length > 0, starts, anyToStart: starts.length > 0 } }];
