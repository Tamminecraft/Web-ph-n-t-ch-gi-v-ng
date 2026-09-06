export type ModelType = "LSTM" | "ARIMA" | "LSTM_ARIMA";

export interface PredictionPoint {
  date: string;
  actual?: number;
  predicted?: number;
}

export interface PredictionResult {
  model: ModelType;
  days: number;
  createdAt: number;
  currentPrice: number;
  maxPredicted: number;
  trend: "up" | "down";
  rmse: number;
  mape: number;
  series: PredictionPoint[];
  // Optional enriched fields from the backend
  recommendation?: string;
  strategy_recommendation?: string;
  signal_label?: { label: string; class_name: string };
  confidence_label?: { level: string; score: number };
  confidence_interval?: { lower: number[]; upper: number[] };
}

export interface HistoryEntry extends PredictionResult {
  id: string;
}

export interface AuthUser {
  name: string;
  email: string;
}

const HISTORY_KEY = "gold_history_v1";
const USER_KEY = "gold_user_v1";
const USERS_KEY = "gold_users_v1";

export const modelLabel: Record<ModelType, string> = {
  LSTM: "Mô hình LSTM",
  ARIMA: "Mô hình ARIMA",
  LSTM_ARIMA: "Mô hình kết hợp LSTM_ARIMA",
};

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
export function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}
export function pushHistory(r: PredictionResult): HistoryEntry {
  const entry: HistoryEntry = { ...r, id: crypto.randomUUID() };
  const all = loadHistory();
  all.unshift(entry);
  saveHistory(all.slice(0, 100));
  return entry;
}

export function loadUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}
export function saveUser(u: AuthUser | null) {
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_KEY);
}
interface StoredUser {
  name: string;
  email: string;
  password: string;
}
export function registerUser(name: string, email: string, password: string): AuthUser {
  const users: StoredUser[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  if (users.find((u) => u.email === email)) throw new Error("Email đã được đăng ký");
  users.push({ name, email, password });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return { name, email };
}
export function loginUser(email: string, password: string): AuthUser {
  const users: StoredUser[] = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  const u = users.find((x) => x.email === email && x.password === password);
  if (!u) throw new Error("Email hoặc mật khẩu không đúng");
  return { name: u.name, email: u.email };
}

// Fallback mock prediction when the backend is unreachable
export function mockPredict(model: ModelType, days: number): PredictionResult {
  const now = Date.now();
  const dayMs = 86400000;
  const basePrice = 4000 + Math.random() * 100;
  const history: PredictionPoint[] = [];
  let p = basePrice - 20;
  for (let i = 7; i >= 1; i--) {
    p += (Math.random() - 0.4) * 30;
    history.push({
      date: new Date(now - i * dayMs).toISOString().slice(5, 10),
      actual: +p.toFixed(2),
    });
  }
  const currentPrice = +p.toFixed(2);
  const direction = Math.random() > 0.5 ? 1 : -1;
  const preds: PredictionPoint[] = [];
  let pp = currentPrice;
  for (let i = 1; i <= days; i++) {
    pp += direction * (Math.random() * 20 + 5) - (Math.random() * 8);
    preds.push({ date: `+${i}`, predicted: +pp.toFixed(2) });
  }
  const series = [...history, { date: history[history.length - 1].date, actual: currentPrice, predicted: currentPrice }, ...preds];
  const maxPredicted = Math.max(...preds.map((x) => x.predicted!));
  const minPredicted = Math.min(...preds.map((x) => x.predicted!));
  const trend: "up" | "down" = preds[preds.length - 1].predicted! >= currentPrice ? "up" : "down";
  const rmseBase = model === "LSTM_ARIMA" ? 12 : model === "LSTM" ? 18 : 24;
  const rmse = +(rmseBase + Math.random() * 8).toFixed(2);
  const mape = +((rmse / currentPrice) * 100).toFixed(2);
  return {
    model,
    days,
    createdAt: now,
    currentPrice,
    maxPredicted: trend === "up" ? maxPredicted : minPredicted,
    trend,
    rmse,
    mape,
    series,
  };
}

export async function fetchPrediction(model: ModelType, days: number): Promise<PredictionResult> {
  try {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const res = await fetch(`${apiBaseUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days_to_predict: days, model_type: model }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Backend trả về HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = await res.json();
    // If backend returns the compact shape used by this app, return it directly
    if (data && Array.isArray((data as any).series)) {
      return { ...data, model, days, createdAt: Date.now() } as PredictionResult;
    }

    // If backend returns the new enriched shape (history + forecast), map it to our PredictionResult
    if (data && data.history && data.forecast) {
      const historyLabels: string[] = data.history.labels || [];
      const historyValues: number[] = data.history.values || [];
      const forecastLabels: string[] = data.forecast.labels || [];
      const forecastValues: number[] = data.forecast.values || [];

      const series: PredictionPoint[] = [];
      for (let i = 0; i < historyLabels.length; i++) {
        series.push({ date: String(historyLabels[i]), actual: Number(historyValues[i]) });
      }
      // mark current price as last actual if present
      const currentPrice = Number(data.current_price ?? (historyValues.length ? historyValues[historyValues.length - 1] : NaN));
      if (!Number.isNaN(currentPrice)) {
        // ensure there's a final history row representing "today" and include a predicted value
        // so the predicted line connects smoothly from current price to the +1 forecast point
        const last = series[series.length - 1];
        if (!last || last.actual !== currentPrice) {
          series.push({ date: "Hôm nay", actual: currentPrice, predicted: currentPrice });
        } else if (last && last.actual === currentPrice && last.predicted == null) {
          // if last exists but lacks predicted, add predicted to connect lines
          last.predicted = currentPrice;
        }
      }
      for (let i = 0; i < forecastLabels.length; i++) {
        series.push({ date: String(forecastLabels[i]), predicted: Number(forecastValues[i]) });
      }

      const baselineMetrics = (data.baseline && data.baseline.metrics) || {};
      const rmse = Number(baselineMetrics.rmse ?? baselineMetrics.RMSE ?? 0);
      const mape = Number(baselineMetrics.mape ?? baselineMetrics.MAPE ?? 0);

      return {
        model,
        days,
        createdAt: Date.now(),
        currentPrice: Number(data.current_price ?? currentPrice ?? 0),
        maxPredicted: Number(data.max_price ?? 0),
        trend: data.trend === "up" ? "up" : "down",
        rmse: rmse || 0,
        mape: mape || 0,
        series,
        recommendation: data.recommendation,
        strategy_recommendation: data.strategy_recommendation,
        signal_label: data.signal_label,
        confidence_label: data.confidence_label,
        confidence_interval: data.confidence_interval,
      } as PredictionResult;
    }

    throw new Error("unknown shape");
  } catch (error) {
    console.error("Không thể lấy dự báo từ backend:", error);
    throw error instanceof Error ? error : new Error("Không thể kết nối backend dự báo");
  }
}
