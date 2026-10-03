#!/usr/bin/env python3
"""The reference check (Phase 2c; D9 correctness gate; R16).

Rebuilds nights, normals and the daily status with the pandas reference and
compares them, stage by stage, with what the database worked out.

  .venv/bin/python scripts/reference/check.py --live
      Signs in to the live project as you (email and password typed here,
      never stored) and checks your own year. Prints counts and any
      differences to this terminal only; nothing is saved.

  .venv/bin/python scripts/reference/check.py --local-synthetic
      On the local copy: makes a throwaway account with a made-up history
      (scripts/reference/synthetic.py), recomputes it in the database, checks
      it, then deletes the account. Runs on every push.
"""

from __future__ import annotations

import hashlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api  # noqa: E402
import compare  # noqa: E402
import synthetic  # noqa: E402


def live() -> bool:
    env = api.live_env()
    headers = api.owner_session(env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY'])
    t0 = time.time()
    data = api.load(env['SUPABASE_URL'], headers)
    print(f"Read {len(data['samples'])} readings, {len(data['nights'])} nights and {len(data['status'])} days "
          f"in {time.time() - t0:.0f} s.")
    return compare.report(compare.run(data))


def local_synthetic() -> bool:
    env = api.local_env()
    url, secret = env['API_URL'], env['SECRET_KEY']
    admin = {'apikey': secret, 'Authorization': f'Bearer {secret}'}
    email = f'reference-{int(time.time())}@example.test'
    status, user = api.call(f'{url}/auth/v1/admin/users', admin, 'POST',
                            {'email': email, 'password': 'reference-check-pass-1', 'email_confirm': True})
    if status != 200:
        raise SystemExit(f'Could not make the throwaway account ({status}): {user}')
    uid = user['id']
    try:
        made = synthetic.make()
        rows = [{'user_id': uid, 'schema_version': 1, 'kind': u['kind'], 'device_tz_offset_min': -300,
                 'local_date': u['local_date'].isoformat(), 'received_at': u['received_at'].isoformat(),
                 'status': 'accepted'} for u in made['uploads']]
        status, ups = api.call(f'{url}/rest/v1/uploads', admin, 'POST', rows, {'Prefer': 'return=representation'})
        if status != 201:
            raise SystemExit(f'Could not store the made-up uploads ({status}): {ups}')
        upload_id = ups[0]['id']
        samples = []
        for i, s in enumerate(made['samples']):
            h = hashlib.sha256(f"{uid}-{i}".encode()).hexdigest()
            samples.append({'user_id': uid, 'upload_id': upload_id, 'type': s['type'],
                            'start_at': s['start_at'].isoformat(), 'end_at': s['end_at'].isoformat(),
                            'tz_offset_min': s['tz_offset_min'], 'value': s['value'], 'stage': s['stage'],
                            'unit': None, 'source_name': s['source_name'], 'sample_hash': '\\x' + h})
        for k in range(0, len(samples), 1000):
            status, body = api.call(f'{url}/rest/v1/samples', admin, 'POST', samples[k:k + 1000])
            if status != 201:
                raise SystemExit(f'Could not store the made-up readings ({status}): {body}')
        first = min(u['local_date'] for u in made['uploads'])
        last = max(u['local_date'] for u in made['uploads'])
        status, body = api.call(f'{url}/rest/v1/rpc/recompute', admin, 'POST',
                                {'p_user': uid, 'p_from': (first.replace(day=1)).isoformat(), 'p_to': last.isoformat()})
        if status != 200:
            raise SystemExit(f'Recompute failed ({status}): {body}')
        print(f"Made-up history: {len(samples)} readings; the database built {body['nights']} nights, "
              f"{body['baselines']} normals and {body['status']} days.")
        data = api.load(url, admin, uid)
        return compare.report(compare.run(data))
    finally:
        api.call(f'{url}/auth/v1/admin/users/{uid}', admin, 'DELETE')


if __name__ == '__main__':
    if '--live' in sys.argv:
        ok = live()
    elif '--local-synthetic' in sys.argv:
        ok = local_synthetic()
    else:
        print(__doc__)
        sys.exit(2)
    print('The database and the reference agree.' if ok else 'The database and the reference differ.')
    sys.exit(0 if ok else 1)
