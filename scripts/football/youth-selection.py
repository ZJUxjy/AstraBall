#!/usr/bin/env python3
"""Stream an actual attribute-level Monte Carlo cohort; retain exact score counts.

python3 scripts/football/youth-selection.py --count 1000000000 --workers 8
Each player has 42 sampled attributes. Identity, personality and potential are
excluded because they do not enter the game's current-ability rating.
"""
import os
for variable in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ[variable] = "1"
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
import csv
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time
import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def load_model():
    source = """import {POSITION_WEIGHTS,ROSTER_POSITIONS,ATTRIBUTE_GROUPS,ATTRIBUTE_KEYS} from './src/football/players.js';
console.log(JSON.stringify({weights:POSITION_WEIGHTS,positions:ROSTER_POSITIONS,groups:ATTRIBUTE_GROUPS,keys:ATTRIBUTE_KEYS}));"""
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=ROOT, text=True))


def simulate_job(job):
    position, index, shard, count, config, model, folder = job
    path = Path(folder) / f"{position}-{shard:03d}.json"
    signature = hashlib.sha256(json.dumps([position, index, shard, count, config, model], sort_keys=True).encode()).hexdigest()
    if path.exists():
        previous = json.loads(path.read_text())
        if previous["signature"] != signature:
            raise ValueError(f"Checkpoint configuration mismatch: {path}")
        return previous
    started = time.perf_counter()
    generator = np.random.Generator(np.random.PCG64(np.random.SeedSequence([config["seed"], index, shard])))
    weights = np.array([model["weights"][position].get(key, 0) for key in model["keys"]], dtype=np.float64)
    denominator = int(weights.sum())
    means = np.array([config["quality"] + (7 if weight else 0)
                      - (48 if key in model["groups"]["goalkeeper"]["fields"] and position != "GK" else 0)
                      - (20 if key in model["groups"]["technical"]["fields"] and position == "GK" else 0)
                      for key, weight in zip(model["keys"], weights)], dtype=np.float64)
    histogram = np.zeros(99 * denominator + 1, dtype=np.int64)
    samples = []
    raw_sum = raw_squares = 0.0
    raw_count = 0
    for start in range(0, count, config["batch"]):
        size = min(config["batch"], count - start)
        # Generate ALL attributes, including ones with zero rating weight.
        attributes = generator.standard_normal((size, len(weights)))
        if start == 0:
            diagnostic = attributes[:1000]
            raw_sum = float(diagnostic.sum())
            raw_squares = float(np.square(diagnostic).sum())
            raw_count = int(diagnostic.size)
        attributes *= config["sigma"]
        attributes += means
        # Positive values: floor(x + 0.5) matches JavaScript Math.round(clamp(x)).
        np.clip(attributes, 1, 99, out=attributes)
        attributes += 0.5
        np.floor(attributes, out=attributes)
        # Explicit reduction avoids platform BLAS side effects and thread pools.
        score_sums = np.einsum('ij,j->i', attributes, weights, optimize=False).astype(np.int64)
        if start == 0:
            expected = [sum(int(value) * int(weight) for value, weight in zip(row, weights)) for row in attributes[:3]]
            assert expected == score_sums[:3].tolist()
        histogram += np.bincount(score_sums, minlength=len(histogram))
        if start == 0 and shard == 0:
            samples = [{"position": position, "attributes": dict(zip(model["keys"], map(int, row))),
                        "score_numerator": int(score), "score_denominator": denominator}
                       for row, score in zip(attributes[:3], score_sums[:3])]
    result = {"signature": signature, "position": position, "shard": shard, "count": count,
              "denominator": denominator, "histogram": histogram.tolist(), "samples": samples,
              "diagnostic_normal": {"count": raw_count, "sum": raw_sum, "squares": raw_squares},
              "seconds": time.perf_counter() - started}
    assert int(histogram.sum()) == count
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result))
    temporary.replace(path)
    return result


def select_top(histogram, wanted):
    selected = Counter()
    remaining = wanted
    for score, count in sorted(histogram.items(), reverse=True):
        take = min(remaining, count)
        if take:
            selected[score] = take
        remaining -= take
        if remaining == 0:
            break
    if remaining:
        raise ValueError("Insufficient cohort")
    return selected


def statistics(histogram):
    ordered = sorted(histogram.items())
    count = sum(histogram.values())
    average = sum(float(score) * n for score, n in ordered) / count
    variance = sum((float(score) - average)**2 * n for score, n in ordered) / count
    quantiles = {}
    for percentile in (0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 99.9, 100):
        rank = max(1, int(np.ceil(percentile / 100 * count)))
        seen = 0
        for score, n in ordered:
            seen += n
            if seen >= rank:
                quantiles[str(percentile)] = float(score)
                break
    return {"count": count, "mean": average, "stddev": variance**0.5,
            "min": float(ordered[0][0]), "max": float(ordered[-1][0]), "quantiles": quantiles}


def write_results(folder, config, model, results, elapsed):
    overall = Counter()
    by_position = {}
    diagnostics = Counter()
    samples = []
    for result in results:
        position_histogram = by_position.setdefault(result["position"], Counter())
        for numerator, count in enumerate(result["histogram"]):
            if count:
                score = Fraction(numerator, result["denominator"])
                overall[score] += count
                position_histogram[score] += count
        diagnostics.update(result["diagnostic_normal"])
        samples.extend(result["samples"])
    assert sum(overall.values()) == config["count"]
    selected = select_top(overall, config["count"] // 100)
    cutoff = min(selected)
    assert sum(selected.values()) == config["count"] // 100
    assert sum(n for score, n in overall.items() if score > cutoff) < config["count"] // 100
    assert sum(n for score, n in overall.items() if score >= cutoff) >= config["count"] // 100
    raw_mean = diagnostics["sum"] / diagnostics["count"]
    raw_variance = diagnostics["squares"] / diagnostics["count"] - raw_mean**2
    rows = []
    for lo in range(1, 100):
        population = sum(n for s, n in overall.items() if lo <= s < lo + 1)
        accepted = sum(n for s, n in selected.items() if lo <= s < lo + 1)
        rows.append({"lower_inclusive": lo, "upper_exclusive": lo + 1, "population_count": population,
                     "selected_count": accepted, "selected_percent": accepted / sum(selected.values()) * 100})
    with (folder / "distribution.csv").open("w") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    with (folder / "exact-scores.csv").open("w") as handle:
        writer = csv.writer(handle)
        writer.writerow(["numerator", "denominator", "ability", "population_count", "selected_count"])
        writer.writerows([s.numerator, s.denominator, float(s), n, selected[s]] for s, n in sorted(overall.items()))
    summary = {"config": config, "model": model,
               "source_sha256": hashlib.sha256((ROOT / "src/football/players.js").read_bytes()).hexdigest(),
               "runtime": {"python": platform.python_version(), "numpy": np.__version__, "platform": platform.platform(), "wall_seconds": elapsed,
                           "summed_worker_seconds": sum(r["seconds"] for r in results), "shards": len(results)},
               "population": statistics(overall), "selected": statistics(selected),
               "cutoff": {"exact": str(cutoff), "value": float(cutoff), "tied_population": overall[cutoff], "tied_selected": selected[cutoff]},
               "normal_diagnostic": {"count": diagnostics["count"], "mean": raw_mean, "stddev": raw_variance**0.5},
               "positions": {p: {**statistics(h), "strictly_above_cutoff": sum(n for s, n in h.items() if s > cutoff),
                                  "at_cutoff": h[cutoff]} for p, h in by_position.items()},
               "distribution": [row for row in rows if row["selected_count"]]}
    (folder / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (folder / "samples.json").write_text(json.dumps(samples, indent=2))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=1_000_000_000)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--batch", type=int, default=50_000)
    parser.add_argument("--seed", type=int, default=20260916)
    parser.add_argument("--quality", type=float, default=44)
    parser.add_argument("--sigma", type=float, default=9)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/youth-selection/billion")
    args = parser.parse_args()
    if args.count <= 0 or args.count % 100 or args.batch < 1 or args.workers < 1 or args.sigma <= 0:
        parser.error("count must be a positive multiple of 100; batch, workers and sigma must be positive")
    model = load_model()
    counts = Counter(model["positions"])
    config = {"count": args.count, "seed": args.seed, "quality": args.quality, "sigma": args.sigma,
              "batch": args.batch, "shard_size": 10_000_000, "age": 16, "professional_appearances": 0,
              "selection": "global top 1% of unrounded position-weighted current ability",
              "generator": "NumPy PCG64 standard_normal; independent attributes; round and clip as game",
              "calibration": "experimental: no youth target recentering; no player-level quality offsets"}
    args.output.mkdir(parents=True, exist_ok=True)
    shards = args.output / "shards"
    shards.mkdir(exist_ok=True)
    jobs = []
    for index, (position, slots) in enumerate(counts.items()):
        count = args.count * slots // len(model["positions"])
        for shard, start in enumerate(range(0, count, config["shard_size"])):
            jobs.append((position, index, shard, min(config["shard_size"], count - start), config, model, str(shards)))
    assert sum(job[3] for job in jobs) == args.count
    started = time.perf_counter()
    results = []
    completed = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(simulate_job, job) for job in jobs]
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            completed += result["count"]
            elapsed = time.perf_counter() - started
            print(f"{completed:,}/{args.count:,} players ({completed/args.count:.1%}), {elapsed:.1f}s", flush=True)
    summary = write_results(args.output, config, model, results, time.perf_counter() - started)
    print(json.dumps({key: summary[key] for key in ("population", "selected", "cutoff", "normal_diagnostic", "runtime")}, indent=2))


if __name__ == "__main__":
    main()
