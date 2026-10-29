#!/usr/bin/env python3
"""Runs the AI test set through the live ai-explain function (owner only, D95).

  .venv/bin/python scripts/ai-eval/run_eval.py                       the development set
  .venv/bin/python scripts/ai-eval/run_eval.py --cases private/ai-heldout/cases-heldout.json --name heldout

You are signed in as the owner (the first time it asks for your email and
password in the Terminal app; after that a remembered session is used). The
cases hold invented numbers only, so no one's readings are sent. The function
asks Claude Opus 5.5 for each answer and runs the filter on it. Full answers
are saved in private/ai-eval/ (never committed); what is printed is the pass
count and the failing checks, not the texts.
"""
import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'reference'))
import api  # noqa: E402

CHUNK = 8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cases', default=str(ROOT / 'docs' / 'ai-eval' / 'cases-dev.json'))
    ap.add_argument('--name', default='dev')
    ns = ap.parse_args()

    cases = json.loads(Path(ns.cases).read_text())
    env = api.live_env()
    base = env['SUPABASE_URL']
    key = env['SUPABASE_PUBLISHABLE_KEY']
    headers = api.owner_session(base, key)

    results = []
    model = instruction = None
    for i in range(0, len(cases), CHUNK):
        chunk = [{'id': c['id'], 'input': c['input']} for c in cases[i:i + CHUNK]]
        status, body = api.call(f'{base}/functions/v1/ai-explain', headers, 'POST', {'kind': 'eval', 'cases': chunk})
        if status != 200:
            raise SystemExit(f'ai-explain answered {status}: {body}')
        model, instruction = body['model'], body['instruction']
        results += body['results']
        print(f'  {len(results)} of {len(cases)} done')

    out = ROOT / 'private' / 'ai-eval'
    out.mkdir(parents=True, exist_ok=True)
    path = out / f'results-{ns.name}-{time.strftime("%Y%m%d-%H%M")}.json'
    path.write_text(json.dumps({'model': model, 'instruction': instruction, 'cases': ns.cases, 'results': results}, indent=1))

    passed = sum(1 for r in results if r['ok'])
    fails = Counter(f for r in results for f in r.get('fails', []))
    tokens_in = sum(r.get('input_tokens', 0) for r in results)
    tokens_out = sum(r.get('output_tokens', 0) for r in results)
    times = sorted(r['latency_ms'] for r in results if 'latency_ms' in r)
    print(f'\nModel {model}, instruction {instruction}: {passed} of {len(results)} passed the filter.')
    for check, n in fails.most_common():
        print(f'  failed {check}: {n}')
    for r in results:
        if not r['ok']:
            print(f"  {r['id']}: {', '.join(r.get('fails', []))}")
    if times:
        print(f'Time per answer: middle {times[len(times) // 2] / 1000:.1f}s, slowest {times[-1] / 1000:.1f}s.')
    cost = tokens_in * 4 / 1e6 + tokens_out * 20 / 1e6
    print(f'Words in and out: {tokens_in} and {tokens_out}; about ${cost:.2f} at Opus 5.5 prices.')
    print(f'Saved: {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
