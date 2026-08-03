import numpy as np
import yfinance as yf
import main
from model_utils import run_rolling_backtest


def evaluate_model(name, forecast_fn, horizon=5, window=24):
    hist = yf.download('GC=F', period='2y', interval='1d')
    close = hist['Close'].dropna().to_numpy(dtype=float)
    if len(close) < window + horizon:
        raise SystemExit('Not enough data')

    result = run_rolling_backtest(close, horizon=horizon, window=window, forecast_fn=forecast_fn)
    print(f'{name} windows={result["windows"]}')
    print(f'{name} metrics={result["metrics"]}')
    return result


if __name__ == '__main__':
    try:
        evaluate_model('LSTM', lambda history, days: main.predict_lstm(history, days))
    except Exception as exc:
        print('LSTM ERROR', exc)

    try:
        evaluate_model('ARIMA', lambda history, days: main.predict_arima(days, history))
    except Exception as exc:
        print('ARIMA ERROR', exc)

    try:
        evaluate_model('LSTM_ARIMA', lambda history, days: main.predict_lstm_arima(history, days))
    except Exception as exc:
        print('LSTM_ARIMA ERROR', exc)

    print('DONE')
