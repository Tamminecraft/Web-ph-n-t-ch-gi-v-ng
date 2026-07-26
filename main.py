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

app = FastAPI(title="AI Gold Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. LOAD MÔ HÌNH VÀ SCALER ---
print("--- Đang nạp các mô hình AI ---")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

try:
    lstm_model = tf.keras.models.load_model(
        os.path.join(MODEL_DIR, "lstm_model.h5"), 
        compile=False
    )
    scaler = joblib.load(os.path.join(MODEL_DIR, "scaler_final.pkl"))

    with open(os.path.join(MODEL_DIR, "arima_model.pkl"), "rb") as f:
        arima_model = pickle.load(f)
    print(">>> Nạp tất cả mô hình AI thành công!")
except Exception as e:
    print(f"❌ Lỗi nạp mô hình: {e}")

class PredictRequest(BaseModel):
    days_to_predict: int
    model_type: str

# --- 2. HÀM DỰ ĐOÁN LSTM (XỬ LÝ LỆCH SCALER 1 CỘT & LSTM 9 CỘT) ---
# --- 2. HÀM DỰ ĐOÁN LSTM (FIX LỖI RỚT GIÁ ĐỘT NGỘT) ---
def predict_lstm(close_prices, days):
    try:
        input_shape = lstm_model.input_shape
        if isinstance(input_shape, list):
            input_shape = input_shape[0]
        
        seq_len = input_shape[1] if (len(input_shape) > 1 and input_shape[1] is not None) else 60
        num_features = input_shape[2] if (len(input_shape) > 2 and input_shape[2] is not None) else 1
    except Exception:
        seq_len = 60
        num_features = 1

    # 1. Lấy dữ liệu và CHUẨN HÓA 1 CỘT (Vì Scaler chỉ nhận đúng 1 cột)
    recent_prices = close_prices[-seq_len:].reshape(-1, 1)
    recent_scaled = scaler.transform(recent_prices)
    
    # 2. BƠM CHÍNH GIÁ TRỊ CLOSE VÀO CÁC CỘT CÒN LẠI (Thay vì số 0)
    if num_features > 1:
        # Nhân bản cột Close đã chuẩn hóa ra thành các cột phụ
        dummy_features = np.tile(recent_scaled, (1, num_features - 1))
        curr_input_2d = np.hstack((recent_scaled, dummy_features))
    else:
        curr_input_2d = recent_scaled

    # 3. Đưa về dạng 3D cho LSTM
    curr_input = curr_input_2d.reshape(1, seq_len, num_features).astype(np.float32)
    
    predictions_scaled = []
    for _ in range(days):
        pred_raw = lstm_model.predict(curr_input, verbose=0)
        pred_val = float(pred_raw.flatten()[0])
        predictions_scaled.append(pred_val)
        
        # Cập nhật cửa sổ trượt: Đưa pred_val vào CẢ 9 CỘT của ngày mới
        next_step = np.full((1, 1, num_features), pred_val, dtype=np.float32)
        curr_input = np.append(curr_input[:, 1:, :], next_step, axis=1)

    # 4. Giải chuẩn hóa (Đưa lại về 1 cột cho Scaler dịch ngược ra giá tiền)
    preds_array = np.array(predictions_scaled).reshape(-1, 1)
    unscaled = scaler.inverse_transform(preds_array)
    
    return unscaled.flatten()

def predict_arima(days):
    forecast = arima_model.forecast(steps=days)
    if hasattr(forecast, 'values'):
        return forecast.values
    return forecast

# --- 3. ENDPOINT XỬ LÝ CHÍNH ---
@app.post("/predict")
async def predict_gold_price(request: PredictRequest):
    try:
        print(f"\n[REQUEST] Nhận yêu cầu: {request.model_type} cho {request.days_to_predict} ngày")
        
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
            raw_preds = predict_lstm(close_prices, request.days_to_predict)
            forecast_values = [round(float(x), 2) for x in raw_preds]

        elif request.model_type == "ARIMA":
            raw_preds = predict_arima(request.days_to_predict)
            forecast_values = [round(float(x), 2) for x in raw_preds]

        elif request.model_type == "LSTM_ARIMA":
            lstm_preds = predict_lstm(close_prices, request.days_to_predict)
            arima_preds = predict_arima(request.days_to_predict)
            
            # Kết hợp kết quả
            forecast_values = [
                round(float(0.5 * l + 0.5 * a), 2) 
                for l, a in zip(lstm_preds, arima_preds)
            ]

        forecast_labels = [f"+{i+1}" for i in range(request.days_to_predict)]
        max_predicted_price = round(float(max(forecast_values)), 2)

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
            "trend": "up" if forecast_values[-1] > current_price else "down",
            "selected_model": request.model_type
        }

    except Exception as e:
        print("\n❌ LỖI CHI TIẾT TRONG QUÁ TRÌNH XỬ LÝ API:")
        traceback.print_exc()
        raise e