// @include helpers
return [{ json: { url: ctx().patchUrl, body: { Status: opt('Status', 'Draft image ready'), 'Posting log': '↻ Redo: no slides were ticked. Tick "Redo" on the slides you want regenerated, then press ↻ Redo images again.' } } }];
