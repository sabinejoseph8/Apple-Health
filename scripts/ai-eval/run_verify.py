#!/usr/bin/env python3
"""Tests the digest's second check on digests already written (D95, option 4).

  .venv/bin/python scripts/ai-eval/run_verify.py

For each digest in the newest saved results of the development set and of the
sealed set, the live ai-explain function is asked to check the text's claims
against its input (no new text is written). Prints which digests the check
accepted and which it refused. For the sealed set only ids and counts are
printed, never the cases. The one digest graded wrong by the fresh grader is
the target; the rest were graded right, so a refusal there is a false alarm.
Invented data only. Owner sign-in as for run_eval.py.
"""
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'reference'))
import api  # noqa: E402

SETS = [('dev', ROOT / 'docs' / 'ai-eval' / 'cases-dev.json', True),
        ('heldout', ROOT / 'private' / 'ai-heldout' / 'cases-heldout.json', False)]


def latest(name):
    files = sorted(glob.glob(str(ROOT / 'private' / 'ai-eval' / f'results-{name}-*.json')))
    return json.loads(Path(files[-1]).read_text()) if files else None


def main():
    env = api.live_env()
    base, key = env['SUPABASE_URL'], env['SUPABASE_PUBLISHABLE_KEY']
    headers = api.owner_session(base, key)
    # The sealed set's one known slip, from the fresh grader's marks.
    known_wrong = set()
    grades = ROOT / 'private' / 'ai-eval' / 'grades-heldout.json'
    if grades.exists():
        known_wrong = {g['id'] for g in json.loads(grades.read_text()) if g['grades'].get('matches_the_numbers') == 'fail'}

    total_cost_in = total_cost_out = 0
    for name, cases_path, show in SETS:
        res = latest(name)
        if not res:
            continue
        outputs = {r['id']: r['output'] for r in res['results'] if r.get('output')}
        cases = [{'id': c['id'], 'input': c['input'], 'output': outputs[c['id']]}
                 for c in json.loads(cases_path.read_text()) if c['kind'] == 'digest' and c['id'] in outputs]
        got = []
        for i in range(0, len(cases), 6):
            status, body = api.call(f'{base}/functions/v1/ai-explain', headers, 'POST', {'kind': 'eval', 'cases': cases[i:i + 6]})
            if status != 200:
                raise SystemExit(f'ai-explain answered {status}: {body}')
            got += body['results']
        flagged = [r for r in got if r.get('verified') and not r['verified']['ok']]
        errors = [r for r in got if 'error' in r]
        print(f'\n{name}: {len(got)} digests checked, {len(flagged)} refused, {len(errors)} errors.')
        for r in got:
            mark = 'refused' if r.get('verified') and not r['verified']['ok'] else 'accepted'
            target = ' (the known wrong one)' if r['id'] in known_wrong else ''
            claims = f"  claims: {r['verified']['unsupported']}" if show and mark == 'refused' else ''
            print(f"  {r['id']}: {mark}{target}{claims}")
        total_cost_in += sum(r.get('input_tokens', 0) for r in got)
        total_cost_out += sum(r.get('output_tokens', 0) for r in got)
    print(f'\nAbout ${total_cost_in * 4 / 1e6 + total_cost_out * 20 / 1e6:.2f} at Opus 5.5 prices.')


if __name__ == '__main__':
    main()
