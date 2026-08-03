import unittest
import numpy as np

from model_utils import (
    build_confidence_interval,
    build_ensemble_forecast,
    build_feature_engineered_forecast,
    build_naive_forecast,
    build_recommendation,
    build_signal_label,
    build_strategy_recommendation,
    run_rolling_backtest,
    summarize_price_signal,
    validate_days_to_predict,
)


class TestModelUtils(unittest.TestCase):
    def test_validate_days_to_predict_accepts_reasonable_inputs(self):
        self.assertEqual(validate_days_to_predict(5), 5)
        self.assertEqual(validate_days_to_predict(30), 30)

    def test_validate_days_to_predict_rejects_invalid_values(self):
        with self.assertRaises(ValueError):
            validate_days_to_predict(0)
        with self.assertRaises(ValueError):
            validate_days_to_predict(61)
        with self.assertRaises(ValueError):
            validate_days_to_predict(-2)

    def test_build_naive_forecast_repeats_last_value(self):
        series = [100.0, 102.0, 103.5]
        forecast = build_naive_forecast(series, 3)
        np.testing.assert_allclose(forecast, np.array([103.5, 103.5, 103.5]))

    def test_summarize_price_signal_detects_uptrend(self):
        signal = summarize_price_signal([100.0, 102.0, 104.0, 106.0])
        self.assertGreater(signal["trend_strength"], 0)
        self.assertGreater(signal["momentum"], 0)

    def test_build_confidence_interval_returns_bounds(self):
        interval = build_confidence_interval([2000.0, 2020.0, 2040.0])
        self.assertEqual(len(interval["lower"]), 3)
        self.assertEqual(len(interval["upper"]), 3)
        self.assertLess(interval["lower"][-1], interval["upper"][-1])

    def test_build_recommendation_flags_uptrend(self):
        recommendation = build_recommendation({"trend": "up", "momentum": 5.0}, [2000.0, 2020.0], 2000.0)
        self.assertIn("tăng", recommendation.lower())

    def test_build_strategy_recommendation_returns_action(self):
        strategy = build_strategy_recommendation({"trend": "up", "momentum": 4.0}, 2000.0)
        self.assertIn("giữ", strategy.lower())

    def test_build_signal_label_returns_classification(self):
        label = build_signal_label({"trend": "up", "momentum": 4.0, "trend_strength": 6.0})
        self.assertIn("buy", label["class_name"].lower())

    def test_build_feature_engineered_forecast_returns_expected_shape(self):
        forecast = build_feature_engineered_forecast([100.0, 102.0, 104.0, 108.0, 112.0], 3)
        self.assertEqual(len(forecast), 3)
        self.assertTrue(np.all(np.isfinite(forecast)))

    def test_build_ensemble_forecast_respects_blend_weight(self):
        series = [100.0, 101.0, 102.0, 103.0]
        secondary = np.array([104.0, 105.0, 106.0], dtype=float)
        technical = build_feature_engineered_forecast(series, 3)
        self.assertTrue(np.allclose(build_ensemble_forecast(series, 3, secondary_forecast=secondary, blend=0.0), technical))
        self.assertTrue(np.allclose(build_ensemble_forecast(series, 3, secondary_forecast=secondary, blend=1.0), secondary))

    def test_run_rolling_backtest_returns_aggregated_metrics(self):
        series = np.linspace(100.0, 130.0, 20)
        result = run_rolling_backtest(series, horizon=2, window=8, forecast_fn=lambda history, days: build_feature_engineered_forecast(history, days))
        self.assertGreater(result["windows"], 0)
        self.assertIn("mae", result["metrics"])
        self.assertTrue(np.isfinite(result["metrics"]["mae"]))


if __name__ == "__main__":
    unittest.main()
