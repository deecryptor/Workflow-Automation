#!/usr/bin/env python3
"""Small n8n API helper for the Carousel Automation workflow. Reads N8N_URL and N8N_API_KEY from a .env file:
$ENV_FILE if set, otherwise the nearest .env in this folder or a parent folder (never pass keys on the command line).

  python3 tools/n8n_api.py list                          # workflows: id, active, name
  python3 tools/n8n_api.py download <id> <out.json>      # full live export (source of truth)
  python3 tools/n8n_api.py backup <id> <label>           # saves live-backup-<date>-before-<label>.n8n.json here
  python3 tools/n8n_api.py upload <id> <file.json> [--go]          # replace an existing workflow, then activate + verify
  python3 tools/n8n_api.py create <file.json> [--go]               # import as a NEW workflow (from-scratch build)
  python3 tools/n8n_api.py set-error-workflow <id> [--go]          # make the workflow its own error workflow

upload/create/set-error-workflow only print what they would send unless --go is given.
Uploading changes the live workflow: get the user's approval first.
"""
import datetime, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def find_env():
    if os.environ.get('ENV_FILE'):
        return os.environ['ENV_FILE']
    d = HERE
    while True:
        if os.path.isfile(os.path.join(d, '.env')):
            return os.path.join(d, '.env')
        if os.path.dirname(d) == d:
            sys.exit('No .env found: copy .env.example to .env and fill in N8N_URL and N8N_API_KEY')
        d = os.path.dirname(d)
# settings keys the public API accepts on PUT/POST (others, e.g. binaryMode/availableInMCP, are rejected)
SETTINGS = ('executionOrder', 'timezone', 'errorWorkflow', 'callerPolicy', 'saveManualExecutions',
            'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress', 'executionTimeout')


def env():
    vals = {}
    for line in open(find_env()):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            vals[k] = v.strip().strip('"').strip("'")
    return vals.get('N8N_URL', 'http://localhost:5678').rstrip('/'), vals['N8N_API_KEY']


def call(method, path, body=None):
    base, key = env()
    req = urllib.request.Request(base + '/api/v1' + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> HTTP {e.code}: {e.read()[:400].decode(errors="replace")}')


def payload(wf):
    s = {k: v for k, v in (wf.get('settings') or {}).items() if k in SETTINGS}
    s.setdefault('executionOrder', 'v1')
    out = {'name': wf['name'], 'nodes': wf['nodes'], 'connections': wf['connections'], 'settings': s}
    if wf.get('staticData') is not None:
        out['staticData'] = wf['staticData']
    return out


def verify(wf_id, sent):
    live = call('GET', f'/workflows/{wf_id}')
    L = {n['name']: n for n in live['nodes']}
    S = {n['name']: n for n in sent['nodes']}
    same = L.keys() == S.keys() and all(L[k]['parameters'] == S[k]['parameters'] for k in S) and live['connections'] == sent['connections']
    print(f"verify: name={live['name']!r} active={live['active']} nodes={len(L)} match={same} errorWorkflow={live['settings'].get('errorWorkflow')}")
    return same


def main(a):
    go = '--go' in a
    a = [x for x in a if x != '--go']
    cmd = a[0] if a else 'help'
    if cmd == 'list':
        for w in call('GET', '/workflows?limit=250')['data']:
            print(w['id'], 'active' if w['active'] else '      ', w['name'])
    elif cmd == 'download':
        wf = call('GET', f'/workflows/{a[1]}')
        json.dump(wf, open(a[2], 'w'), indent=2, ensure_ascii=False)
        print('saved', a[2], '|', wf['name'], '|', len(wf['nodes']), 'nodes | updated', wf['updatedAt'])
    elif cmd == 'backup':
        wf = call('GET', f'/workflows/{a[1]}')
        out = os.path.join(HERE, f'live-backup-{datetime.date.today()}-before-{a[2]}.n8n.json')
        json.dump(wf, open(out, 'w'), indent=2, ensure_ascii=False)
        print('backup saved:', out)
    elif cmd == 'upload':
        body = payload(json.load(open(a[2])))
        if not go:
            return print(f"DRY RUN: would PUT {len(body['nodes'])} nodes as {body['name']!r} to {a[1]} with settings {body['settings']}. Add --go to upload.")
        call('PUT', f'/workflows/{a[1]}', body)
        call('POST', f'/workflows/{a[1]}/activate')
        verify(a[1], body)
    elif cmd == 'create':
        body = payload(json.load(open(a[1])))
        body['settings'].pop('errorWorkflow', None)  # the new workflow's own id isn't known yet
        if not go:
            return print(f"DRY RUN: would create {body['name']!r} with {len(body['nodes'])} nodes. Add --go to create.")
        new = call('POST', '/workflows', body)
        print('created workflow id:', new['id'], '(credentials must still be picked in the editor before activating)')
    elif cmd == 'set-error-workflow':
        wf = call('GET', f'/workflows/{a[1]}')
        wf.setdefault('settings', {})['errorWorkflow'] = a[1]
        body = payload(wf)
        if not go:
            return print(f"DRY RUN: would set errorWorkflow={a[1]} on {wf['name']!r}. Add --go.")
        call('PUT', f'/workflows/{a[1]}', body)
        if wf.get('active'):
            call('POST', f'/workflows/{a[1]}/activate')
        verify(a[1], body)
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
