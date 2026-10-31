import json
import os
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

import main


class FakeTicker:
    def history(self, period="6mo", **kwargs):
        dates = pd.date_range("2026-01-01", periods=80, freq="D")
        close = np.linspace(2000.0, 2080.0, len(dates))
        return pd.DataFrame({"Close": close}, index=dates)


class TestPredictionApi(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.patches = [
            patch.object(main.yf, "Ticker", return_value=FakeTicker()),
            patch.object(main, "predict_lstm", return_value=np.array([2081.0, 2082.0, 2083.0])),
            patch.object(main, "predict_arima", return_value=np.array([2079.0, 2079.5, 2080.0])),
            patch.object(main, "predict_lstm_arima", return_value=np.array([2080.5, 2081.0, 2081.5])),
        ]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [item.stop() for item in self.patches])

    def test_health_reports_version_and_models(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertIn("LSTM", response.json()["models"])

    def test_predict_contract_for_all_models(self):
        for model in ("LSTM", "ARIMA", "LSTM_ARIMA"):
            with self.subTest(model=model):
                response = self.client.post(
                    "/predict",
                    json={"days_to_predict": 3, "model_type": model},
                )
                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["selected_model"], model)
                self.assertEqual(len(payload["forecast"]["values"]), 3)
                self.assertIn("final_price", payload)
                self.assertIn("baseline", payload)
                self.assertEqual(payload["baseline"]["source"], "naive_last_value")
                self.assertIn("model_metrics", payload)


class TestChatApi(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_chat_reports_missing_api_key_as_service_unavailable(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            response = self.client.post("/chat", json={"messages": [{"role": "user", "text": "Xin chào"}]})

        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY", response.json()["detail"])

    def test_chat_returns_provider_reply(self):
        provider_response = MagicMock()
        provider_response.__enter__.return_value = provider_response
        provider_response.read.return_value = json.dumps({
            "candidates": [{"content": {"parts": [{"text": "Xin chào bạn."}]}}],
        }).encode("utf-8")
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False),
            patch.object(main, "urlopen", return_value=provider_response),
        ):
            response = self.client.post("/chat", json={"messages": [{"role": "user", "text": "Xin chào"}]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"reply": "Xin chào bạn."})

    def test_chat_maps_provider_http_errors_to_bad_gateway(self):
        provider_error = HTTPError("https://example.test", 404, "Not Found", {}, None)
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False),
            patch.object(main, "urlopen", side_effect=provider_error),
        ):
            response = self.client.post("/chat", json={"messages": [{"role": "user", "text": "Xin chào"}]})

        self.assertEqual(response.status_code, 502)
        self.assertIn("HTTP 404", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()