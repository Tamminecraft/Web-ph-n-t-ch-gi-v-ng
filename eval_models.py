import numpy as np
import pandas as pd
import yfinance as yf
import main


def mape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = np.abs(y_true) > 1e-8
    return np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100


def metrics(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mae = np.mean(np.abs(y_true - y_pred))
    rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
    mape_val = mape(y_true, y_pred)
    direction = np.mean(np.sign(np.diff(y_pred)) == np.sign(np.diff(y_true))) * 100
    return {
        'mae': round(float(mae), 2),
        'rmse': round(float(rmse), 2),
        'mape': round(float(mape_val), 2),
        'direction_accuracy': round(float(direction), 2),
    }

hist = yf.download('GC=F', period='2y', interval='1d')
close = hist['Close'].dropna().to_numpy()
if len(close) < 90:
    raise SystemExit('Not enough data')

# Use the last 7 points as holdout and the preceding data as input history.
cut = len(close) - 7
history_before = close[:cut]
actual_next = close[cut:]

results = {}

for name, fn in [
    ('LSTM', lambda: main.predict_lstm(history_before, 7)),
    ('ARIMA', lambda: main.predict_arima(7)),
]:
    try:
        pred = np.asarray(fn(), dtype=float)
        results[name] = metrics(actual_next, pred)
        print(name, 'pred=', np.round(pred, 2))
        print(name, 'actual=', np.round(actual_next, 2))
        print(name, results[name])
    except Exception as exc:
        print(name, 'ERROR', exc)

# LSTM_ARIMA uses LSTM_ARIMA if available else fallback blend.
try:
    pred = np.asarray(main.predict_lstm_arima(history_before, 7), dtype=float)
    results['LSTM_ARIMA'] = metrics(actual_next, pred)
    print('LSTM_ARIMA', np.round(pred, 2))
    print('LSTM_ARIMA', results['LSTM_ARIMA'])
except Exception as exc:
    print('LSTM_ARIMA ERROR', exc)

print('DONE')
