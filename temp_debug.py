import traceback
import yfinance as yf
import main

hist = yf.download('GC=F', period='2y', interval='1d')
close = hist['Close'].dropna().to_numpy()
cut = len(close) - 7
history_before = close[:cut]
print('len', len(history_before))

for name, fn in [('LSTM', lambda: main.predict_lstm(history_before, 7)), ('ARIMA', lambda: main.predict_arima(7)), ('LSTM_ARIMA', lambda: main.predict_lstm_arima(history_before, 7))]:
    try:
        print(name, fn())
    except Exception as e:
        print('ERROR', name)
        traceback.print_exc()
