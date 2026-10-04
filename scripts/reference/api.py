"""Reads Clarivi's tables through Supabase's web interface (Phase 2c).

Uses only Python's standard library for the web calls. On the live project
the reference check signs in as the owner (email and password typed at the
prompt, never stored), so row-level security limits it to her own rows and no
secret key is needed on her Mac. On the local copy it uses the local secret
key from `supabase status`.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PAGE = 1000


def call(url: str, headers: Dict[str, str], method: str = 'GET', body=None, extra: Optional[Dict[str, str]] = None):
    data = None if body is None else json.dumps(body).encode()
    h = {'Content-Type': 'application/json', **headers, **(extra or {})}
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def local_env() -> Dict[str, str]:
    out = subprocess.run(['npx', 'supabase', 'status', '-o', 'env'], cwd=ROOT, capture_output=True, text=True,
                         stdin=subprocess.DEVNULL, check=True).stdout
    env = {}
    for line in out.splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"')
    return env


def live_env() -> Dict[str, str]:
    """The live project's address and publishable key, from private/live.env
    (public values, kept out of the repository anyway)."""
    env = {}
    path = ROOT / 'private' / 'live.env'
    for line in path.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env


def sign_in(api: str, key: str, email: str, password: str) -> Dict[str, str]:
    status, body = call(f'{api}/auth/v1/token?grant_type=password', {'apikey': key}, 'POST',
                        {'email': email, 'password': password})
    if status != 200:
        raise SystemExit('Sign-in failed. Check the email and password.')
    return {'apikey': key, 'Authorization': f"Bearer {body['access_token']}", 'refresh_token': body['refresh_token']}


def _session_file(api: str) -> Path:
    name = 'session-live.json' if 'supabase.co' in api else 'session-local.json'
    return ROOT / 'private' / name


def _save_session(api: str, refresh_token: str) -> None:
    """Writes the session readable by this Mac account only, from the start."""
    path = _session_file(api)
    path.parent.mkdir(exist_ok=True)
    tmp = path.with_suffix('.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(json.dumps({'refresh_token': refresh_token}))
    os.replace(tmp, path)


def owner_session(api: str, key: str) -> Dict[str, str]:
    """Signs in as the owner. The first time, asks for the email and
    password (use the Mac's Terminal app, which hides what you type); after
    that, a remembered session in private/ is used and renewed, so the
    password isn't needed again. Delete the private/session-*.json files to
    forget it."""
    path = _session_file(api)
    if path.exists():
        token = json.loads(path.read_text()).get('refresh_token')
        status, body = call(f'{api}/auth/v1/token?grant_type=refresh_token', {'apikey': key}, 'POST',
                            {'refresh_token': token})
        if status == 200:
            _save_session(api, body['refresh_token'])
            return {'apikey': key, 'Authorization': f"Bearer {body['access_token']}"}
        print('The remembered sign-in has expired. Please sign in again.')
    import getpass
    email = input('Your Clarivi email: ').strip()
    password = getpass.getpass('Your Clarivi password (hidden in the Terminal app): ')
    headers = sign_in(api, key, email, password)
    _save_session(api, headers.pop('refresh_token'))
    return headers


def fetch(api: str, headers: Dict[str, str], table: str, select: str, order: str, filters: str = '') -> List[dict]:
    rows: List[dict] = []
    offset = 0
    while True:
        q = f'select={urllib.parse.quote(select, safe=",")}&order={order}&limit={PAGE}&offset={offset}'
        if filters:
            q += '&' + filters
        status, body = call(f'{api}/rest/v1/{table}?{q}', headers)
        if status != 200:
            raise SystemExit(f'Reading {table} failed ({status}): {body}')
        rows += body
        if len(body) < PAGE:
            return rows
        offset += PAGE


def _times(df: pd.DataFrame, cols) -> pd.DataFrame:
    for c in cols:
        if c in df:
            df[c] = pd.to_datetime(df[c], utc=True, format='ISO8601')
    return df


def _dates(df: pd.DataFrame, cols) -> pd.DataFrame:
    for c in cols:
        if c in df:
            df[c] = pd.to_datetime(df[c]).dt.date
    return df


def load(api: str, headers: Dict[str, str], user_id: Optional[str] = None) -> Dict[str, pd.DataFrame]:
    """Everything the reference check needs, for one user."""
    f = f'user_id=eq.{user_id}' if user_id else ''
    samples = pd.DataFrame(fetch(api, headers, 'samples', 'id,type,start_at,end_at,tz_offset_min,value,stage,source_name',
                                 'id', f),
                           columns=['id', 'type', 'start_at', 'end_at', 'tz_offset_min', 'value', 'stage', 'source_name'])
    uploads = pd.DataFrame(fetch(api, headers, 'uploads', 'id,received_at,kind,status,local_date', 'id', f),
                           columns=['id', 'received_at', 'kind', 'status', 'local_date'])
    nights = pd.DataFrame(fetch(api, headers, 'nights', '*', 'night_date', f))
    baselines = pd.DataFrame(fetch(api, headers, 'baselines', '*', 'night_date,metric', f))
    status = pd.DataFrame(fetch(api, headers, 'daily_status', '*', 'date', f))
    events = pd.DataFrame(fetch(api, headers, 'events', 'date,type,note,source', 'id', f),
                          columns=['date', 'type', 'note', 'source'])
    profiles = fetch(api, headers, 'profiles', 'user_id,latest_tz_offset_min', 'user_id', f)
    workouts = pd.DataFrame(fetch(api, headers, 'workouts',
                                  'activity,start_at,end_at,tz_offset_min,duration_min,avg_hr,source_name', 'start_at', f),
                            columns=['activity', 'start_at', 'end_at', 'tz_offset_min', 'duration_min', 'avg_hr',
                                     'source_name'])
    _times(samples, ['start_at', 'end_at'])
    _times(uploads, ['received_at'])
    _dates(uploads, ['local_date'])
    _times(nights, ['sleep_start', 'sleep_end'])
    _dates(nights, ['night_date'])
    _dates(baselines, ['night_date'])
    _dates(status, ['date'])
    _dates(events, ['date'])
    _times(workouts, ['start_at', 'end_at'])
    offset = (profiles[0].get('latest_tz_offset_min') if profiles else None) or 0
    today = (pd.Timestamp.now(tz='UTC').tz_convert(None) + pd.Timedelta(minutes=int(offset))).date()
    return {'samples': samples, 'uploads': uploads, 'nights': nights, 'baselines': baselines, 'status': status,
            'events': events, 'workouts': workouts, 'today': today}
