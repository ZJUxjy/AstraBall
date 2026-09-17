"""Independent checks for exact top-percent selection and streamed statistics."""
import importlib.util
from pathlib import Path
from fractions import Fraction
from collections import Counter
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location("experiment", Path(__file__).with_name("youth-selection.py"))
experiment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(experiment)


class SelectionTests(unittest.TestCase):
    def test_histogram_selection_matches_sorting_individual_players(self):
        random = np.random.default_rng(146)
        scores = [Fraction(int(random.integers(600, 1100)), int(random.choice([14, 15, 16, 17, 19]))) for _ in range(20_000)]
        self.assertEqual(experiment.select_top(Counter(scores), 200), Counter(sorted(scores, reverse=True)[:200]))

    def test_exactly_fills_cutoff_ties(self):
        histogram = Counter({Fraction(60): 100, Fraction(61): 8, Fraction(62): 3})
        self.assertEqual(experiment.select_top(histogram, 10), Counter({Fraction(62): 3, Fraction(61): 7}))

    def test_equivalent_rational_scores_merge(self):
        histogram = Counter([Fraction(960, 16), Fraction(840, 14), Fraction(900, 15)])
        self.assertEqual(histogram, Counter({Fraction(60): 3}))

    def test_weighted_statistics_match_expanded_population(self):
        values = [Fraction(827, 14)] * 17 + [Fraction(60)] * 30 + [Fraction(125, 2)] * 3
        actual = experiment.statistics(Counter(values))
        reference = np.array(list(map(float, values)))
        self.assertAlmostEqual(actual["mean"], reference.mean())
        self.assertAlmostEqual(actual["stddev"], reference.std())
        for p, score in actual["quantiles"].items():
            self.assertEqual(score, np.quantile(reference, float(p) / 100, method="inverted_cdf"))

    def test_pilot_matches_weighted_normal_prediction(self):
        import json
        path = experiment.ROOT / "artifacts/youth-selection/pilot-verified/summary.json"
        if not path.exists():
            self.skipTest("Run the 1-million player pilot first")
        summary = json.loads(path.read_text())
        model = summary["model"]
        variance = 0
        for position, frequency in Counter(model["positions"]).items():
            weights = np.array(list(model["weights"][position].values()))
            # Rounding a broad normal approximately adds 1/12 attribute variance.
            variance += frequency / len(model["positions"]) * (81 + 1/12) * np.square(weights).sum() / weights.sum()**2
        self.assertAlmostEqual(summary["population"]["mean"], 51, delta=.02)
        self.assertAlmostEqual(summary["population"]["stddev"], variance**.5, delta=.02)


if __name__ == "__main__":
    unittest.main()
