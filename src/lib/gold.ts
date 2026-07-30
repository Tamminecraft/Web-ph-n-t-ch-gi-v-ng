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
    const res = await fetch("http://127.0.0.1:8000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days_to_predict: days, model_type: model }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    // Best-effort mapping; fall back to mock shape if fields absent
    if (data && Array.isArray(data.series)) {
      return { ...data, model, days, createdAt: Date.now() } as PredictionResult;
    }
    throw new Error("unknown shape");
  } catch {
    return mockPredict(model, days);
  }
}
