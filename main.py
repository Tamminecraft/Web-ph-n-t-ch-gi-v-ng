from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
import pickle
import os
import traceback
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from model_utils import (
    build_confidence_interval,
    build_confidence_label,
    build_ensemble_forecast,
    build_feature_engineered_forecast,
    build_naive_forecast,
    build_recommendation,
    build_signal_label,
    build_strategy_recommendation,
    compute_metrics,
    summarize_price_signal,
    validate_days_to_predict,
)

app = FastAPI(title="AI Gold Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "https://goldprediction.netlify.app,http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. LOAD MÔ HÌNH VÀ SCALER ---
print("--- Đang nạp các mô hình AI ---")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# Helper to resolve model URLs from environment variables or fallbacks
def resolve_model_url(env_name: str, default: str | None = None):
    v = os.getenv(env_name)
    if v:
        return v
    return default

# Default: use the file ids you provided as direct-download Drive links
DEFAULT_LSTM_ID = "1-S8hOrIDd7d0CZj2aClA-vm8SbMJcc1k"
DEFAULT_SCALER_ID = "1NnIzMCQNZeUY1g5PD6p4tgIDoIBvjhMH"
DEFAULT_ARIMA_ID = "14Qxre6r9fn7zxgZGIK-VM7mNIzSTlrfn"
DEFAULT_ARIMA_SCALER_ID = "1M9Cz4OI26zvH-xd_hlRVYoXAO4Ne6smo"
DEFAULT_LSTM_ARIMA_ID = "1xXEtwbZ9MNmtZshXlrnCNWZY1Ieh2mtf"
DEFAULT_LSTM_ARIMA_SCALER_ID = "1EwBE6a3I3SA0G9XxpRmANNBrOlg1Dk_z"
DEFAULT_LSTM_URL = f"https://drive.google.com/uc?export=download&id={DEFAULT_LSTM_ID}"
DEFAULT_SCALER_URL = f"https://drive.google.com/uc?export=download&id={DEFAULT_SCALER_ID}"
DEFAULT_ARIMA_URL = f"https://drive.google.com/uc?export=download&id={DEFAULT_ARIMA_ID}"
DEFAULT_ARIMA_SCALER_URL = f"https://drive.google.com/uc?export=download&id={DEFAULT_ARIMA_SCALER_ID}"
DEFAULT_LSTM_ARIMA_URL = f"https://drive.google.com/uc?export=download&id={DEFAULT_LSTM_ARIMA_ID}"
DEFAULT_LSTM_ARIMA_SCALER_URL = f"https://drive.google.com/uc?export=download&id={DEFAULT_LSTM_ARIMA_SCALER_ID}"

LSTM_MODEL_URL = resolve_model_url("LSTM_MODEL_URL", DEFAULT_LSTM_URL)
SCALER_URL = resolve_model_url("SCALER_URL", DEFAULT_SCALER_URL)
ARIMA_URL = resolve_model_url("ARIMA_URL", DEFAULT_ARIMA_URL)
ARIMA_SCALER_URL = resolve_model_url("ARIMA_SCALER_URL", DEFAULT_ARIMA_SCALER_URL)
LSTM_ARIMA_URL = resolve_model_url("LSTM_ARIMA_URL", DEFAULT_LSTM_ARIMA_URL)
LSTM_ARIMA_SCALER_URL = resolve_model_url("LSTM_ARIMA_SCALER_URL", DEFAULT_LSTM_ARIMA_SCALER_URL)

ARIMA_USE_SCALER = os.getenv("ARIMA_USE_SCALER", "false").lower() in ("1", "true", "yes")
ARIMA_USE_LOG = os.getenv("ARIMA_USE_LOG", "false").lower() in ("1", "true", "yes")

if ARIMA_USE_LOG:
    print("⚙️ ARIMA sẽ áp dụng log-exp reverse transform sau khi dự báo")
if ARIMA_USE_SCALER:
    print("⚙️ ARIMA sẽ áp dụng inverse_transform với arima_scaler.pkl nếu có")

def download_file(url: str, dest_path: str) -> bool:
    """Download `url` to `dest_path`. Prefer gdown for Drive links."""
    if not url:
        return False
    try:
        if "drive.google.com" in url or "uc?export=download" in url:
            gdown = None
            try:
                import importlib
                gdown = importlib.import_module("gdown")
            except Exception:
                try:
                    import subprocess
                    subprocess.check_call(["pip", "install", "gdown"])
                    import importlib
                    gdown = importlib.import_module("gdown")
                except Exception:
                    gdown = None
            if gdown:
                try:
                    gdown.download(url, dest_path, quiet=False)
                except Exception:
                    from urllib.request import urlretrieve
                    urlretrieve(url, dest_path)
            else:
                from urllib.request import urlretrieve
                urlretrieve(url, dest_path)
        else:
            from urllib.request import urlretrieve
            urlretrieve(url, dest_path)
        return os.path.exists(dest_path)
    except Exception as exc:
        print(f"❌ Lỗi khi tải file từ {url}: {exc}")
        return False


def download_or_redownload(url: str, dest_path: str, description: str):
    if os.path.exists(dest_path):
        try:
            os.remove(dest_path)
        except Exception:
            pass
    if url:
        print(f"Đang tải lại {description} từ: {url}")
        download_file(url, dest_path)


print("--- Kiểm tra và tải model nếu cần ---")
lstm_h5_path = os.path.join(MODEL_DIR, "lstm_model.h5")
lstm_keras_path = os.path.join(MODEL_DIR, "LSTM_Model.keras")
lstm_path = lstm_keras_path if os.path.exists(lstm_keras_path) else lstm_h5_path
scaler_path = os.path.join(MODEL_DIR, "scaler_final.pkl")
lstm_scaler_x_path = os.path.join(MODEL_DIR, "lstm_scaler_x.pkl")
arima_path = os.path.join(MODEL_DIR, "arima_model.pkl")
if not os.path.exists(arima_path):
    arima_path = os.path.join(MODEL_DIR, "gold_arima_model.pkl")
arima_scaler_path = os.path.join(MODEL_DIR, "arima_scaler.pkl")
lstm_arima_path = os.path.join(MODEL_DIR, "lstm_arima_model.h5")
if not os.path.exists(lstm_arima_path):
    lstm_arima_path = os.path.join(MODEL_DIR, "hybrid_lstm_model.h5")
lstm_arima_scaler_path = os.path.join(MODEL_DIR, "lstm_arima_scaler.pkl")
if not os.path.exists(lstm_arima_scaler_path):
    lstm_arima_scaler_path = os.path.join(MODEL_DIR, "scaler_res.pkl")

if not os.path.exists(lstm_path) and LSTM_MODEL_URL:
    print(f"Đang tải LSTM từ: {LSTM_MODEL_URL}")
    download_file(LSTM_MODEL_URL, lstm_path)

if not os.path.exists(scaler_path) and SCALER_URL:
    print(f"Đang tải Scaler từ: {SCALER_URL}")
    download_file(SCALER_URL, scaler_path)

if not os.path.exists(arima_path) and ARIMA_URL:
    print(f"Đang tải ARIMA từ: {ARIMA_URL}")
    download_file(ARIMA_URL, arima_path)

if not os.path.exists(arima_scaler_path) and ARIMA_SCALER_URL:
    print(f"Đang tải Scaler ARIMA từ: {ARIMA_SCALER_URL}")
    download_file(ARIMA_SCALER_URL, arima_scaler_path)

if not os.path.exists(lstm_arima_path) and LSTM_ARIMA_URL:
    print(f"Đang tải LSTM_ARIMA từ: {LSTM_ARIMA_URL}")
    download_file(LSTM_ARIMA_URL, lstm_arima_path)

if not os.path.exists(lstm_arima_scaler_path) and LSTM_ARIMA_SCALER_URL:
    print(f"Đang tải Scaler LSTM_ARIMA từ: {LSTM_ARIMA_SCALER_URL}")
    download_file(LSTM_ARIMA_SCALER_URL, lstm_arima_scaler_path)

# Try loading models; missing optional models will be set to None
lstm_model = None
scaler = None
lstm_scaler_x = None
arima_model = None
arima_scaler = None
lstm_arima_model = None
lstm_arima_scaler = None
try:
    if os.path.exists(lstm_path):
        lstm_model = tf.keras.models.load_model(lstm_path, compile=False)
        print(">>> Nạp LSTM thành công từ:", lstm_path)
    else:
        print("⚠️ Không tìm thấy file LSTM ở", lstm_path)
    if os.path.exists(scaler_path):
        scaler = joblib.load(scaler_path)
        print(">>> Nạp Scaler thành công từ:", scaler_path)
    else:
        print("⚠️ Không tìm thấy file Scaler ở", scaler_path)
    if os.path.exists(lstm_scaler_x_path):
        lstm_scaler_x = joblib.load(lstm_scaler_x_path)
        print(">>> Nạp LSTM input scaler thành công từ:", lstm_scaler_x_path)
    else:
        print("⚠️ Chưa có LSTM input scaler ở", lstm_scaler_x_path)
    if os.path.exists(arima_path):
        with open(arima_path, "rb") as f:
            arima_model = pickle.load(f)
        print(">>> Nạp ARIMA thành công từ:", arima_path)
    else:
        print("⚠️ Không tìm thấy file ARIMA ở", arima_path)
    if os.path.exists(arima_scaler_path):
        try:
            arima_scaler = joblib.load(arima_scaler_path)
            if not hasattr(arima_scaler, 'inverse_transform'):
                raise ValueError("File Scaler ARIMA không có inverse_transform")
            print(">>> Nạp Scaler ARIMA thành công từ:", arima_scaler_path)
        except Exception as exc:
            print(f"⚠️ Scaler ARIMA không hợp lệ: {exc}")
            arima_scaler = None
            if ARIMA_USE_SCALER and ARIMA_SCALER_URL:
                download_or_redownload(ARIMA_SCALER_URL, arima_scaler_path, "Scaler ARIMA")
                try:
                    arima_scaler = joblib.load(arima_scaler_path)
                    print(">>> Nạp lại Scaler ARIMA thành công từ:", arima_scaler_path)
                except Exception as exc2:
                    print(f"❌ Không thể nạp lại Scaler ARIMA: {exc2}")
                    arima_scaler = None
    else:
        print("⚠️ Không tìm thấy file Scaler ARIMA ở", arima_scaler_path)
        if ARIMA_USE_SCALER and ARIMA_SCALER_URL:
            download_or_redownload(ARIMA_SCALER_URL, arima_scaler_path, "Scaler ARIMA")
            try:
                arima_scaler = joblib.load(arima_scaler_path)
                print(">>> Nạp Scaler ARIMA thành công từ:", arima_scaler_path)
            except Exception as exc2:
                print(f"❌ Không thể nạp Scaler ARIMA: {exc2}")
                arima_scaler = None
    if os.path.exists(lstm_arima_path):
        try:
            lstm_arima_model = tf.keras.models.load_model(lstm_arima_path, compile=False)
            print(">>> Nạp LSTM_ARIMA thành công từ:", lstm_arima_path)
        except Exception as exc:
            print(f"⚠️ Lỗi nạp LSTM_ARIMA: {exc}")
            download_or_redownload(LSTM_ARIMA_URL, lstm_arima_path, "LSTM_ARIMA")
            try:
                lstm_arima_model = tf.keras.models.load_model(lstm_arima_path, compile=False)
                print(">>> Nạp lại LSTM_ARIMA thành công từ:", lstm_arima_path)
            except Exception as exc2:
                print(f"❌ Không thể nạp lại LSTM_ARIMA: {exc2}")
                lstm_arima_model = None
    else:
        print("⚠️ Không tìm thấy file LSTM_ARIMA ở", lstm_arima_path)
    if os.path.exists(lstm_arima_scaler_path):
        lstm_arima_scaler = joblib.load(lstm_arima_scaler_path)
        print(">>> Nạp Scaler LSTM_ARIMA thành công từ:", lstm_arima_scaler_path)
    else:
        print("⚠️ Không tìm thấy file Scaler LSTM_ARIMA ở", lstm_arima_scaler_path)
except Exception as e:
    print(f"❌ Lỗi nạp mô hình: {e}")

class PredictRequest(BaseModel):
    days_to_predict: int
    model_type: str

# --- 2. HÀM DỰ ĐOÁN LSTM (XỬ LÝ LỆCH SCALER 1 CỘT & LSTM 9 CỘT) ---
# --- 2. HÀM DỰ ĐOÁN LSTM (FIX LỖI RỚT GIÁ ĐỘT NGỘT) ---
def predict_feature_engineered(close_prices, days):
    return build_feature_engineered_forecast(np.asarray(close_prices, dtype=float).tolist(), days)


def predict_lstm(close_prices, days, model=None, model_scaler=None):
    if model is None:
        model = lstm_model
    if model_scaler is None:
        model_scaler = scaler

    if model is None or model_scaler is None:
        raise RuntimeError("LSTM model hoặc output scaler chưa được nạp")

    try:
        input_shape = model.input_shape
        if isinstance(input_shape, list):
            input_shape = input_shape[0]
        
        seq_len = input_shape[1] if (len(input_shape) > 1 and input_shape[1] is not None) else 60
        num_features = input_shape[2] if (len(input_shape) > 2 and input_shape[2] is not None) else 1
    except Exception:
        seq_len = 60
        num_features = 1

    history_values = np.asarray(close_prices, dtype=float).reshape(-1)
    if history_values.size == 0:
        raise ValueError("close_prices không được rỗng")

    if seq_len > history_values.size:
        history_values = np.pad(history_values, (seq_len - history_values.size, 0), mode="edge")

    if num_features == 5:
        if lstm_scaler_x is None or not hasattr(lstm_scaler_x, "transform"):
            raise RuntimeError("LSTM cần models/lstm_scaler_x.pkl để chuẩn hóa Open/High/Low/Close/Volume")
        gold = yf.Ticker("GC=F")
        feature_history = gold.history(period="6mo", interval="1d", auto_adjust=False)
        feature_history = feature_history.dropna(subset=["Open", "High", "Low", "Close", "Volume"])
        if len(feature_history) < seq_len:
            raise ValueError("Không đủ dữ liệu OHLCV cho LSTM")
        features = feature_history[["Open", "High", "Low", "Close", "Volume"]].tail(seq_len).to_numpy(dtype=float)
        curr_input_2d = lstm_scaler_x.transform(features)
    elif num_features == 1:
        recent_prices = history_values[-seq_len:].reshape(-1, 1)
        curr_input_2d = model_scaler.transform(recent_prices)
    else:
        raise RuntimeError(f"LSTM input có {num_features} feature, không khớp pipeline Colab (5 feature)")

    # 3. Đưa về dạng 3D cho LSTM
    curr_input = curr_input_2d.reshape(1, seq_len, num_features).astype(np.float32)
    
    predictions_scaled = []
    for _ in range(days):
        pred_raw = model.predict(curr_input, verbose=0)
        pred_val = float(pred_raw.flatten()[0])
        predictions_scaled.append(pred_val)
        if num_features == 5:
            next_step = curr_input[:, -1:, :].copy()
            close_idx = 3
            next_step[0, 0, close_idx] = pred_val
        else:
            next_step = np.full((1, 1, num_features), pred_val, dtype=np.float32)
        curr_input = np.append(curr_input[:, 1:, :], next_step, axis=1)

    preds_array = np.array(predictions_scaled).reshape(-1, 1)
    unscaled = model_scaler.inverse_transform(preds_array)
    ml_preds = unscaled.flatten()

    return ml_preds

def predict_lstm_arima(close_prices, days):
    if lstm_arima_model is None or lstm_arima_scaler is None:
        raise RuntimeError("Hybrid LSTM_ARIMA model hoặc residual scaler chưa được nạp")
    arima_forecast = predict_arima(days)
    residual_values = np.asarray(arima_model.resid, dtype=float).reshape(-1, 1)[1:]
    scaled_residuals = lstm_arima_scaler.transform(residual_values)
    look_back = int(lstm_arima_model.input_shape[1])
    if len(scaled_residuals) < look_back:
        raise ValueError("Không đủ residual để chạy hybrid LSTM_ARIMA")
    current_window = scaled_residuals[-look_back:].reshape(1, look_back, 1).astype(np.float32)
    residual_forecast = []
    for _ in range(days):
        next_residual = float(lstm_arima_model.predict(current_window, verbose=0).flatten()[0])
        residual_forecast.append(next_residual)
        current_window = np.append(
            current_window[:, 1:, :],
            np.asarray(next_residual, dtype=np.float32).reshape(1, 1, 1),
            axis=1,
        )
    residual_usd = lstm_arima_scaler.inverse_transform(np.asarray(residual_forecast).reshape(-1, 1)).flatten()
    return np.asarray(arima_forecast, dtype=float) + residual_usd

def predict_arima(days, close_prices=None):
    if arima_model is None:
        raise RuntimeError("ARIMA model chưa được nạp")

    try:
        forecast = getattr(arima_model, 'get_forecast', arima_model.forecast)(steps=days)
    except Exception:
        forecast = arima_model.forecast(steps=days)

    if hasattr(forecast, 'predicted_mean'):
        forecast_values = np.asarray(forecast.predicted_mean)
    elif hasattr(forecast, 'values'):
        forecast_values = forecast.values
    else:
        forecast_values = np.asarray(forecast)

    if ARIMA_USE_LOG:
        forecast_values = np.exp(forecast_values)

    forecast_values = np.asarray(forecast_values, dtype=float).reshape(-1)
    if forecast_values.size < days:
        forecast_values = np.resize(forecast_values, days)
    elif forecast_values.size > days:
        forecast_values = forecast_values[:days]

    return forecast_values

# --- 3. ENDPOINT XỬ LÝ CHÍNH ---
@app.post("/predict")
async def predict_gold_price(request: PredictRequest):
    try:
        days = validate_days_to_predict(request.days_to_predict)
        print(f"\n[REQUEST] Nhận yêu cầu: {request.model_type} cho {days} ngày")
        
        gold = yf.Ticker("GC=F")
        hist = gold.history(period="6mo")
        
        if hist.empty or len(hist) < 60:
            raise ValueError("Không đủ dữ liệu giá vàng từ Yahoo Finance")

        recent_data = hist.tail(7)
        history_labels = [date.strftime("%d-%m") for date in recent_data.index]
        history_values = [round(float(val), 2) for val in recent_data['Close'].tolist()]
        current_price = history_values[-1]

        close_prices = hist['Close'].values

        forecast_values = []
        
        if request.model_type == "LSTM":
            raw_preds = predict_lstm(close_prices, days)
            forecast_values = [round(float(x), 2) for x in raw_preds]

        elif request.model_type == "ARIMA":
            raw_preds = predict_arima(days)
            forecast_values = [round(float(x), 2) for x in raw_preds]

        elif request.model_type == "LSTM_ARIMA":
            if lstm_arima_model is not None:
                raw_preds = predict_lstm_arima(close_prices, days)
                forecast_values = [round(float(x), 2) for x in raw_preds]
            else:
                lstm_preds = predict_lstm(close_prices, days)
                arima_preds = predict_arima(days)
                forecast_values = [
                    round(float(0.5 * l + 0.5 * a), 2)
                    for l, a in zip(lstm_preds, arima_preds)
                ]
        else:
            raise ValueError("model_type không hợp lệ")

        naive_forecast = build_naive_forecast(close_prices.tolist(), days)
        baseline_metrics = compute_metrics(close_prices[-days:], naive_forecast)
        signal_summary = summarize_price_signal(hist['Close'].tail(10).tolist())
        confidence_interval = build_confidence_interval(
            [float(x) for x in close_prices[-10:]], scale=0.01, horizon=days
        )
        recommendation = build_recommendation(signal_summary, hist['Close'].tail(10).tolist(), current_price)
        strategy_recommendation = build_strategy_recommendation(signal_summary, current_price)
        signal_label = build_signal_label(signal_summary)
        confidence_label = build_confidence_label(baseline_metrics)
        forecast_labels = [f"+{i+1}" for i in range(days)]
        max_predicted_price = round(float(max(forecast_values)), 2)
        min_predicted_price = round(float(min(forecast_values)), 2)
        final_predicted_price = round(float(forecast_values[-1]), 2)

        print("[SUCCESS] Tính toán AI thành công!")
        
        return {
            "history": {
                "labels": history_labels,
                "values": history_values
            },
            "forecast": {
                "labels": forecast_labels,
                "values": forecast_values
            },
            "current_price": current_price,
            "max_price": max_predicted_price,
            "min_price": min_predicted_price,
            "final_price": final_predicted_price,
            "trend": "up" if forecast_values[-1] > current_price else "down",
            "selected_model": request.model_type,
            "baseline": {
                "forecast": [round(float(x), 2) for x in naive_forecast],
                "metrics": baseline_metrics,
                "source": "naive_last_value",
            },
            "signal": signal_summary,
            "confidence_interval": confidence_interval,
            "recommendation": recommendation,
            "strategy_recommendation": strategy_recommendation,
            "signal_label": signal_label,
            "confidence_label": confidence_label,
        }

    except Exception as e:
        print("\n❌ LỖI CHI TIẾT TRONG QUÁ TRÌNH XỬ LÝ API:")
        traceback.print_exc()
        raise e


@app.post("/chat")
async def chat_with_gold_ring(payload: dict):
    """Proxy chatbot requests so the Gemini key is never exposed in the browser."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY chưa được cấu hình")

    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages phải là một danh sách không rỗng")

    contents = []
    for message in messages[-20:]:
        if not isinstance(message, dict) or message.get("role") not in {"user", "model"}:
            raise ValueError("Tin nhắn không hợp lệ")
        text = message.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Nội dung tin nhắn không hợp lệ")
        contents.append({"role": message["role"], "parts": [{"text": text.strip()}]})

    body = json.dumps({
        "systemInstruction": {
            "parts": [{
                "text": "Bạn là chuyên gia phân tích thị trường vàng. Trả lời ngắn gọn bằng tiếng Việt, nêu rõ khi thông tin chỉ mang tính tham khảo và không đưa ra cam kết lợi nhuận."
            }]
        },
        "contents": contents,
    }).encode("utf-8")
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as exc:
        raise RuntimeError("Không thể kết nối dịch vụ chatbot") from exc

    reply = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return {"reply": reply or "Ta đang bận suy ngẫm... hãy hỏi lại sau."}


if __name__ == "__main__":
    import uvicorn
    print("\n🚀 Khởi động FastAPI server...")
    uvicorn.run(app, host="127.0.0.1", port=8000)