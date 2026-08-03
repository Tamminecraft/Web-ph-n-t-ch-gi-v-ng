from __future__ import annotations

import numpy as np
from typing import Sequence


def validate_days_to_predict(days: int) -> int:
    """Validate forecast horizon and keep it within a practical range."""
    if isinstance(days, bool) or not isinstance(days, (int, np.integer)):
        raise ValueError("days_to_predict phải là số nguyên")
    if days < 1:
        raise ValueError("days_to_predict phải lớn hơn 0")
    if days > 60:
        raise ValueError("days_to_predict tối đa là 60 ngày")
    return int(days)


def build_naive_forecast(series: Sequence[float], days: int) -> np.ndarray:
    """Create a simple baseline forecast by repeating the last observed value."""
    values = np.asarray(series, dtype=float)
    if values.size == 0:
        raise ValueError("series không được rỗng")
    return np.full(int(days), float(values[-1]), dtype=float)


def build_feature_engineered_forecast(series: Sequence[float], days: int) -> np.ndarray:
    """Create a short-term forecast using simple technical indicators and trend momentum."""
    values = np.asarray(series, dtype=float).reshape(-1)
    if values.size == 0:
        raise ValueError("series không được rỗng")

    horizon = int(days)
    if horizon < 1:
        raise ValueError("days phải lớn hơn 0")
    if values.size < 2:
        return np.full(horizon, float(values[-1]), dtype=float)

    recent = values[-min(len(values), 10):]
    last = float(recent[-1])
    start = float(recent[0])

    if len(recent) >= 2:
        momentum = float(recent[-1] - recent[-2])
    else:
        momentum = 0.0

    if len(recent) >= 3:
        short_sma = float(np.mean(recent[-3:]))
        long_window = min(len(values), 20)
        long_sma = float(np.mean(values[-long_window:]))
        trend_signal = (short_sma - long_sma) / max(abs(long_sma), 1e-8)
    else:
        trend_signal = (last - start) / max(abs(start), 1e-8)

    volatility = float(np.std(np.diff(recent))) if len(recent) > 2 else max(abs(momentum), 1e-6)
    drift = (trend_signal * max(abs(last), 1.0) * 0.2) + (momentum * 0.35)
    drift = float(np.clip(drift, -abs(last) * 0.15, abs(last) * 0.15))
    if abs(volatility) < 1e-8:
        drift *= 0.6

    damping = np.linspace(1.0, 0.75, horizon)
    forecast = last + drift * damping
    return np.maximum(forecast, 0.0, dtype=float)


def build_ensemble_forecast(series: Sequence[float], days: int, secondary_forecast: Sequence[float] | None = None, blend: float = 0.5) -> np.ndarray:
    """Blend a technical forecast with a secondary signal for a more stable prediction."""
    primary = build_feature_engineered_forecast(series, days)
    if secondary_forecast is None:
        return primary

    secondary = np.asarray(secondary_forecast, dtype=float)
    if secondary.size != int(days):
        raise ValueError("secondary_forecast phải có cùng số lượng điểm như days")

    blend = float(np.clip(blend, 0.0, 1.0))
    return (1.0 - blend) * primary + blend * secondary


def compute_metrics(y_true: Sequence[float], y_pred: Sequence[float]) -> dict[str, float]:
    """Compute common regression metrics for evaluation."""
    y_true_arr = np.asarray(y_true, dtype=float)
    y_pred_arr = np.asarray(y_pred, dtype=float)
    if y_true_arr.shape != y_pred_arr.shape:
        raise ValueError("y_true và y_pred phải có cùng kích thước")

    mae = float(np.mean(np.abs(y_true_arr - y_pred_arr)))
    rmse = float(np.sqrt(np.mean((y_true_arr - y_pred_arr) ** 2)))
    mape = float(np.mean(np.abs((y_true_arr - y_pred_arr) / np.maximum(np.abs(y_true_arr), 1e-8))) * 100)
    direction = float(np.mean(np.sign(np.diff(y_pred_arr)) == np.sign(np.diff(y_true_arr))) * 100)

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
        "direction_accuracy": round(direction, 4),
    }


def summarize_price_signal(series: Sequence[float]) -> dict[str, float | str]:
    """Return a compact trend summary from recent price values."""
    values = np.asarray(series, dtype=float)
    if values.size < 2:
        raise ValueError("series cần ít nhất 2 điểm")

    first = float(values[0])
    last = float(values[-1])
    change = last - first
    pct_change = (change / first * 100.0) if first != 0 else 0.0
    momentum = float(values[-1] - values[-2])
    volatility = float(np.std(np.diff(values))) if len(values) > 2 else 0.0

    trend = "up" if change > 0 else "down" if change < 0 else "flat"
    trend_strength = abs(pct_change)

    return {
        "trend": trend,
        "change_pct": round(pct_change, 2),
        "momentum": round(momentum, 2),
        "trend_strength": round(trend_strength, 2),
        "volatility": round(volatility, 2),
    }


def build_confidence_interval(series: Sequence[float], scale: float = 0.03) -> dict[str, list[float]]:
    """Build a simple confidence interval around a forecast by using recent volatility."""
    values = np.asarray(series, dtype=float)
    if values.size == 0:
        raise ValueError("series không được rỗng")

    base = values[-1]
    recent_vol = float(np.std(np.diff(values))) if len(values) > 2 else 0.0
    band = max(recent_vol, abs(base) * scale)
    horizon = np.arange(1, len(values) + 1, dtype=float)
    lower = base + (horizon * band * -1.0)
    upper = base + (horizon * band)

    return {
        "lower": [round(float(x), 2) for x in lower],
        "upper": [round(float(x), 2) for x in upper],
    }


def build_recommendation(signal: dict[str, float | str], history: Sequence[float], current_price: float) -> str:
    """Generate a short natural-language recommendation based on signal and price history."""
    trend = str(signal.get("trend", "flat")).lower()
    momentum = float(signal.get("momentum", 0.0))
    change_pct = float(signal.get("change_pct", 0.0))
    history_values = np.asarray(history, dtype=float)

    if history_values.size == 0:
        raise ValueError("history không được rỗng")

    if trend == "up" and momentum > 0:
        return f"Xu hướng đang tăng mạnh (+{change_pct:.1f}%). Có thể xem xét giữ vị thế hoặc theo dõi thêm nếu giá vượt quá {current_price:.2f}."
    if trend == "down" and momentum < 0:
        return f"Xu hướng đang giảm (-{abs(change_pct):.1f}%). Nên thận trọng và ưu tiên bảo toàn vốn hơn là mở vị thế mới."
    return f"Biến động đang đi ngang. Hãy chờ tín hiệu xác nhận trước khi quyết định mua hoặc bán từ mức {current_price:.2f}."


def build_confidence_label(metrics: dict[str, float]) -> dict[str, str | float]:
    """Convert evaluation metrics into a simple confidence label and score."""
    mape = float(metrics.get("mape", 100.0))
    direction = float(metrics.get("direction_accuracy", 0.0))

    if mape < 5 and direction > 60:
        level = "cao"
        score = 0.9
    elif mape < 10 and direction > 50:
        level = "trung bình"
        score = 0.7
    else:
        level = "thấp"
        score = 0.4

    return {"level": level, "score": round(score, 2)}


def build_strategy_recommendation(signal: dict[str, float | str], current_price: float) -> str:
    """Create a concise strategy recommendation for the user."""
    trend = str(signal.get("trend", "flat")).lower()
    momentum = float(signal.get("momentum", 0.0))

    if trend == "up" and momentum > 0:
        return f"Chiến lược đề xuất: giữ vị thế và theo dõi breakout quanh {current_price:.2f}."
    if trend == "down" and momentum < 0:
        return f"Chiến lược đề xuất: thận trọng, ưu tiên bảo toàn vốn và tránh mở mới quanh {current_price:.2f}."
    return f"Chiến lược đề xuất: chờ tín hiệu xác nhận trước khi mua hoặc bán ở mức {current_price:.2f}."


def build_signal_label(signal: dict[str, float | str]) -> dict[str, str]:
    """Classify the current signal into an easy-to-read label for the UI."""
    trend = str(signal.get("trend", "flat")).lower()
    momentum = float(signal.get("momentum", 0.0))
    trend_strength = float(signal.get("trend_strength", 0.0))

    if trend == "up" and momentum > 0 and trend_strength >= 3:
        return {"label": "Strong Buy", "class_name": "buy"}
    if trend == "up" and momentum > 0:
        return {"label": "Buy", "class_name": "buy"}
    if trend == "down" and momentum < 0:
        return {"label": "Sell", "class_name": "sell"}
    return {"label": "Hold", "class_name": "hold"}


def run_rolling_backtest(series: Sequence[float], horizon: int = 5, window: int = 12, forecast_fn=None) -> dict[str, object]:
    """Evaluate a forecast function over rolling windows and aggregate basic metrics."""
    values = np.asarray(series, dtype=float)
    if values.size < window + horizon:
        raise ValueError("series quá ngắn để chạy backtest")
    if horizon < 1:
        raise ValueError("horizon phải lớn hơn 0")

    if forecast_fn is None:
        forecast_fn = lambda history, days: build_feature_engineered_forecast(history, days)

    errors: list[float] = []
    direction_hits: list[float] = []
    mape_values: list[float] = []
    windows = 0

    for start in range(0, len(values) - window - horizon + 1):
        history = values[start:start + window]
        actual = values[start + window:start + window + horizon]
        prediction = np.asarray(forecast_fn(history.tolist(), horizon), dtype=float)

        if prediction.size != actual.size:
            prediction = np.resize(prediction, actual.size)

        abs_errors = np.abs(actual - prediction)
        errors.extend(abs_errors.tolist())
        actual_flat = np.asarray(actual, dtype=float).reshape(-1)
        prediction_flat = np.asarray(prediction, dtype=float).reshape(-1)

        if actual_flat.size >= 2 and prediction_flat.size >= 2:
            common_len = min(actual_flat.size - 1, prediction_flat.size - 1)
            if common_len > 0:
                actual_diff = np.diff(actual_flat)[:common_len]
                prediction_diff = np.diff(prediction_flat)[:common_len]
                direction_hits.append(float(np.mean(np.sign(prediction_diff) == np.sign(actual_diff))))
            else:
                direction_hits.append(0.0)
        denom = np.maximum(np.abs(actual), 1e-8)
        mape_values.extend((np.abs(actual - prediction) / denom * 100.0).tolist())
        windows += 1

    if not errors:
        raise ValueError("không có cửa sổ backtest nào được đánh giá")

    mae = float(np.mean(errors))
    rmse = float(np.sqrt(np.mean(np.square(errors))))
    mape = float(np.mean(mape_values)) if mape_values else float("nan")
    direction_accuracy = float(np.mean(direction_hits) * 100.0) if direction_hits else float("nan")

    return {
        "windows": windows,
        "metrics": {
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "mape": round(mape, 4),
            "direction_accuracy": round(direction_accuracy, 4),
        },
    }
