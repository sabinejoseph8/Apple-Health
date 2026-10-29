#!/usr/bin/env python3
"""D94, Phase 7b-2: does Sabine's year of data support three new analysis modules?

A read-only check. It reads CSV files exported from the LOCAL copy (a restored
backup) into private/module-check/ and writes private/module-check/report.md.
Nothing in this file holds a reading, and the report stays in private/.

Run:  .venv/bin/python scripts/module-check/check.py

The tests and what counts as "supported" are fixed below, before the data was
looked at (the same rule as the test targets, D9). One guard was added before
running: a family-wise permutation check across all combinations tried, since
trying many combinations finds a pattern by chance.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'private' / 'module-check'
RNG = np.random.default_rng(94)

# ---- Fixed before looking -------------------------------------------------
SLEEP_CUTOFFS_MIN = [360, 390, 420, 450]          # 6, 6.5, 7, 7.5 hours
SLEEP_MIN_GROUP = 15                               # nights in the short group
LAG_DAYS = [1, 2, 3]                               # lag 0 is a negative control
ALPHA_SLEEP_FW = 0.05
ALPHA_LAG_FW = 0.01
FALSE_ALARMS_PER_YEAR = 1.0
PLANTED_SHIFT = 1.0                                # in normal-spreads
PLANTED_WITHIN_NIGHTS = 7
PLANTED_RATE = 0.8
WINDOW_RECENT = 14
WINDOW_REF = 42
# ---------------------------------------------------------------------------


def mad_sd(x):
    x = np.asarray(x, float)
    x = x[~np.isnan(x)]
    if len(x) < 5:
        return np.nan
    return 1.4826 * np.median(np.abs(x - np.median(x)))


def load():
    nights = pd.read_csv(DIR / 'nights.csv', parse_dates=['night_date'])
    ready = pd.read_csv(DIR / 'readiness.csv', parse_dates=['date'])
    work = pd.read_csv(DIR / 'workouts.csv', parse_dates=['start_at'])
    nights = nights[nights['finished'] == 't'].copy() if nights['finished'].dtype == object else nights[nights['finished']].copy()
    nights = nights.set_index('night_date').sort_index()
    return nights, ready, work


def badness(ready):
    """Per night and metric: how much worse than usual, in normal-spreads.
    Positive is worse. The stored deviation's sign is read from the data."""
    out = {}
    for metric, worse_when in (('hrv', 'low'), ('sleeping_hr', 'high'), ('sleep', 'low')):
        d = ready[(ready['metric'] == metric) & ready['deviation'].notna()].copy()
        raw_sign = np.sign(np.corrcoef(d['deviation'], d['value'] - d['baseline'])[0, 1])
        higher_is_more = d['deviation'] * raw_sign       # positive means the value is above usual
        bad = -higher_is_more if worse_when == 'low' else higher_is_more
        out[metric] = pd.Series(bad.values, index=d['date'].values)
    return pd.DataFrame(out).sort_index()


def welch_t(a, b):
    na, nb = len(a), len(b)
    va, vb = np.var(a, ddof=1), np.var(b, ddof=1)
    return (np.mean(a) - np.mean(b)) / np.sqrt(va / na + vb / nb)


def circular_shifts(n, minimum):
    return range(minimum, n - minimum)


# ---- 1. Sleep need ---------------------------------------------------------

def sleep_need(nights, bad):
    lines = ['## 1. Sleep need', '']
    sleep = nights['asleep_min'].astype(float)
    results = []
    half = nights.index[len(nights) // 2]
    for timing in (0, 1):                               # same night, next night
        for metric in ('hrv', 'sleeping_hr'):
            outcome = bad[metric].reindex(nights.index + pd.Timedelta(days=timing))
            outcome.index = nights.index
            for cutoff in SLEEP_CUTOFFS_MIN:
                ok = outcome.notna() & sleep.notna()
                short = (sleep < cutoff) & ok
                rest = (sleep >= cutoff) & ok
                if short.sum() < SLEEP_MIN_GROUP or rest.sum() < SLEEP_MIN_GROUP:
                    continue
                a, b = outcome[short].values, outcome[rest].values
                diff = a.mean() - b.mean()
                boots = np.array([RNG.choice(a, len(a)).mean() - RNG.choice(b, len(b)).mean() for _ in range(2000)])
                lo, hi = np.percentile(boots, [2.5, 97.5])
                halves = []
                for part in (ok & (nights.index < half), ok & (nights.index >= half)):
                    s, r = outcome[short & part], outcome[rest & part]
                    halves.append(np.nan if len(s) < 5 or len(r) < 5 else s.mean() - r.mean())
                results.append(dict(timing=timing, metric=metric, cutoff=cutoff, n_short=int(short.sum()),
                                    diff=diff, lo=lo, hi=hi, h1=halves[0], h2=halves[1],
                                    t=welch_t(a, b), short=short, rest=rest, ok=ok, outcome=outcome))
    # Family-wise: shift the outcomes against the sleep series, take the largest t each time.
    n = len(nights)
    max_t = []
    for k in circular_shifts(n, 7):
        best = -np.inf
        for r in results:
            shifted = np.roll(r['outcome'].values, k)
            ok = ~np.isnan(shifted) & r['ok'].values
            short = (sleep.values < r['cutoff']) & ok
            rest = (sleep.values >= r['cutoff']) & ok
            if short.sum() >= SLEEP_MIN_GROUP and rest.sum() >= SLEEP_MIN_GROUP:
                best = max(best, welch_t(shifted[short], shifted[rest]))
        max_t.append(best)
    max_t = np.array(max_t)
    for r in results:
        r['p_fw'] = (np.sum(max_t >= r['t']) + 1) / (len(max_t) + 1)
        r['meets'] = bool(r['lo'] > 0 and r['h1'] > 0 and r['h2'] > 0)
    lines.append(f'{len(results)} combinations tried (cut-offs {SLEEP_CUTOFFS_MIN} min, same night and next night, '
                 f'HRV and sleeping heart rate); {len(nights)} finished nights.')
    lines.append('')
    lines.append('| when | metric | cut-off | nights short | worse by (spreads) | 95% range | half 1 | half 2 | meets | family-wise p |')
    lines.append('|---|---|---|---|---|---|---|---|---|---|')
    for r in results:
        lines.append(f"| {'same night' if r['timing'] == 0 else 'next night'} | {r['metric']} | {r['cutoff']} | {r['n_short']} | "
                     f"{r['diff']:+.2f} | {r['lo']:+.2f} to {r['hi']:+.2f} | {r['h1']:+.2f} | {r['h2']:+.2f} | "
                     f"{'yes' if r['meets'] else 'no'} | {r['p_fw']:.3f} |")
    meeting = [r for r in results if r['meets']]
    strong = [r for r in meeting if r['p_fw'] < ALPHA_SLEEP_FW]
    if strong:
        verdict = 'SUPPORTED'
    elif meeting:
        verdict = 'SUGGESTIVE (meets the fixed criteria but not the family-wise guard)'
    else:
        verdict = 'NOT SUPPORTED'
    lines += ['', f'**Verdict: {verdict}.** Combinations meeting the fixed criteria: {len(meeting)} of {len(results)}; '
              f'also passing the family-wise guard: {len(strong)}.', '']
    return lines, verdict, results


# ---- 2. Lagged relationships ----------------------------------------------

def rank(x):
    return pd.Series(x).rank().values


def spearman(a, b):
    ok = ~np.isnan(a) & ~np.isnan(b)
    if ok.sum() < 30:
        return np.nan
    return np.corrcoef(rank(a[ok]), rank(b[ok]))[0, 1]


def lagged(bad, work):
    lines = ['## 2. Lagged relationships (training, then HRV or sleeping heart rate)', '']
    work = work.dropna(subset=['duration_min']).copy()
    work['day'] = (work['start_at'] + pd.to_timedelta(work['tz_offset_min'], unit='m')).dt.tz_localize(None).dt.normalize()
    last = work['day'].max()
    days = pd.date_range(bad.index.min() - pd.Timedelta(days=1), last)
    hard_cut = work['avg_hr'].dropna().quantile(0.75)
    load = pd.DataFrame({'minutes': work.groupby('day')['duration_min'].sum(),
                         'hard': work[work['avg_hr'] >= hard_cut].groupby('day')['duration_min'].sum()}).reindex(days).fillna(0)
    results = []
    half = days[len(days) // 2]
    for lag in [0] + LAG_DAYS:
        for metric in ('hrv', 'sleeping_hr'):
            outcome = bad[metric].reindex(days + pd.Timedelta(days=lag)).values
            for kind in ('minutes', 'hard'):
                x = load[kind].values.astype(float)
                rho = spearman(x, outcome)
                h1 = spearman(x[days < half], outcome[days < half])
                h2 = spearman(x[days >= half], outcome[days >= half])
                results.append(dict(lag=lag, metric=metric, kind=kind, rho=rho, h1=h1, h2=h2, x=x, y=outcome))
    tested = [r for r in results if r['lag'] in LAG_DAYS]
    n = len(days)
    max_abs = []
    for k in circular_shifts(n, 14):
        best = 0
        for r in tested:
            best = max(best, abs(spearman(np.roll(r['x'], k), r['y'])))
        max_abs.append(best)
    max_abs = np.array(max_abs)
    for r in tested:
        r['p_fw'] = (np.sum(max_abs >= abs(r['rho'])) + 1) / (len(max_abs) + 1)
        r['meets'] = bool(r['rho'] > 0 and r['h1'] > 0 and r['h2'] > 0 and r['p_fw'] < ALPHA_LAG_FW)
    lines.append(f'{len(work)} workouts on {int((load["minutes"] > 0).sum())} days; {n} days analysed '
                 f'(through {last.date()}, when the workouts file ends). "hard" means workouts whose average heart rate is in the top quarter.')
    lines.append('Lag 0 is a negative control (training that day cannot change that morning), so it should show nothing.')
    lines.append('')
    lines.append('| lag (days) | metric | training | rho (worse = positive) | half 1 | half 2 | meets | family-wise p |')
    lines.append('|---|---|---|---|---|---|---|---|')
    for r in results:
        p = f"{r['p_fw']:.3f}" if 'p_fw' in r else 'control'
        m = ('yes' if r['meets'] else 'no') if 'meets' in r else '-'
        lines.append(f"| {r['lag']} | {r['metric']} | {r['kind']} | {r['rho']:+.2f} | {r['h1']:+.2f} | {r['h2']:+.2f} | {m} | {p} |")
    meeting = [r for r in tested if r['meets']]
    verdict = 'SUPPORTED (on past data only)' if meeting else 'NOT SUPPORTED'
    lines += ['', f'**Verdict: {verdict}.** Combinations meeting the fixed criteria: {len(meeting)} of {len(tested)}. '
              f'The live sync sends no workouts, so any use going forward needs the Shortcut widened first.', '']
    return lines, verdict, results


# ---- 3. Change detection ---------------------------------------------------

def flagged(x, threshold):
    """Night by night: has the last 14 nights' level moved away from the 42
    nights before them by more than `threshold` normal-spreads?"""
    n = len(x)
    stat = np.full(n, np.nan)
    for t in range(WINDOW_RECENT + WINDOW_REF - 1, n):
        ref = x[t - WINDOW_RECENT - WINDOW_REF + 1: t - WINDOW_RECENT + 1]
        rec = x[t - WINDOW_RECENT + 1: t + 1]
        sd = mad_sd(ref)
        if np.isnan(sd) or sd == 0:
            continue
        stat[t] = (np.nanmedian(rec) - np.nanmedian(ref)) / sd
    return stat


def episodes(stat, threshold):
    """Starts of runs above the threshold, runs closer than 14 nights merged."""
    on = np.abs(np.nan_to_num(stat)) > threshold
    starts, quiet = [], WINDOW_RECENT
    for t, v in enumerate(on):
        if v and quiet >= WINDOW_RECENT:
            starts.append(t)
        quiet = 0 if v else quiet + 1
    return starts


def block_shuffle(x, block=7):
    n = len(x)
    blocks = [x[i:i + block] for i in range(0, n, block)]
    order = RNG.permutation(len(blocks))
    return np.concatenate([blocks[i] for i in order])


def change_detection(nights):
    lines = ['## 3. Change detection', '']
    series = {'hrv': nights['hrv_median'].astype(float).values,
              'sleeping_hr': nights['sleeping_hr'].astype(float).values,
              'sleep': nights['asleep_min'].astype(float).values}
    series = {k: v[~np.isnan(v)] for k, v in series.items()}
    n_min = min(len(v) for v in series.values())
    # Tune the threshold so shuffled copies of the data raise at most 1 false alarm per year.
    chosen = None
    grid = np.arange(0.5, 3.01, 0.05)
    for T in grid:
        alarms = nightsum = 0
        for name, x in series.items():
            for _ in range(20):
                for sh in (RNG.permutation(x), block_shuffle(x)):
                    stat = flagged(sh, T)
                    alarms += len(episodes(stat, T))
                    nightsum += int(np.sum(~np.isnan(stat)))
        rate = alarms / nightsum * 365
        if rate <= FALSE_ALARMS_PER_YEAR:
            chosen = (T, rate)
            break
    if chosen is None:
        lines += ['No threshold up to 3 spreads keeps false alarms under 1 a year.', '', '**Verdict: NOT SUPPORTED.**', '']
        return lines, 'NOT SUPPORTED', {}
    T, rate = chosen
    lines.append(f'Rule: the last {WINDOW_RECENT} nights\' middle value against the {WINDOW_REF} nights before them; '
                 f'flag when it has moved by more than **{T:.2f}** normal-spreads. Threshold chosen on shuffled copies of the '
                 f'year (shuffled at random and in 7-night blocks) so they raise {rate:.2f} false alarms a year.')
    lines.append('')
    lines.append('Planted shifts (a step added to a shuffled copy, 200 tries each):')
    lines.append('')
    lines.append('| shift (spreads) | found within 7 nights | found within 14 nights | found within 30 nights |')
    lines.append('|---|---|---|---|')
    rates = {}
    for s in (0.5, 0.75, 1.0, 1.5, 2.0):
        within = {7: 0, 14: 0, 30: 0}
        tries = 200
        for _ in range(tries):
            name = list(series)[RNG.integers(len(series))]
            x = RNG.permutation(series[name])
            sd = mad_sd(x)
            start = int(RNG.integers(80, len(x) - 31))
            y = x.copy()
            y[start:] += s * sd * (1 if RNG.random() < 0.5 else -1)
            stat = flagged(y, T)
            hit = next((t for t in range(start, len(y)) if abs(np.nan_to_num(stat[t])) > T), None)
            if hit is not None:
                for w in within:
                    within[w] += (hit - start) <= w
        rates[s] = {w: v / tries for w, v in within.items()}
        lines.append(f'| {s} | {rates[s][7]:.0%} | {rates[s][14]:.0%} | {rates[s][30]:.0%} |')
    caught = rates[PLANTED_SHIFT][PLANTED_WITHIN_NIGHTS] >= PLANTED_RATE
    lines.append('')
    lines.append('On her real year (candidate shifts, not verified; the rule flags a level that moved, it does not say why):')
    lines.append('')
    for name, x in series.items():
        stat = flagged(x, T)
        idx = nights['hrv_median' if name == 'hrv' else 'sleeping_hr' if name == 'sleeping_hr' else 'asleep_min'].dropna().index
        starts = episodes(stat, T)
        lines.append(f'- {name}: ' + (', '.join(str(idx[t].date()) for t in starts) if starts else 'none flagged'))
    verdict = 'SUPPORTED' if caught else 'PARTLY SUPPORTED (only for bigger shifts than one spread)'
    lines += ['', f'**Verdict: {verdict}.** A one-spread shift was found within {PLANTED_WITHIN_NIGHTS} nights '
              f'{rates[PLANTED_SHIFT][PLANTED_WITHIN_NIGHTS]:.0%} of the time (target {PLANTED_RATE:.0%}).', '']
    return lines, verdict, rates


def main():
    nights, ready, work = load()
    bad = badness(ready)
    report = ['# Module check: what Sabine\'s year supports (D94, 7b-2)', '',
              'Private. Made by `scripts/module-check/check.py` from a restored backup (28 October 2026). '
              'Not for the public repository.', '']
    verdicts = {}
    for name, fn, args in (('Sleep need', sleep_need, (nights, bad)),
                           ('Lagged relationships', lagged, (bad, work)),
                           ('Change detection', change_detection, (nights,))):
        lines, verdict, _ = fn(*args)
        report += lines
        verdicts[name] = verdict
        print(f'{name}: {verdict}')
    (DIR / 'report.md').write_text('\n'.join(report) + '\n')
    print(f'Report: {(DIR / "report.md").relative_to(ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
