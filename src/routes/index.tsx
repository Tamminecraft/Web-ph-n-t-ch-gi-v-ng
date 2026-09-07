import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, Loader2, Sparkles, History as HistoryIcon,
  LogOut, LogIn, AlertTriangle, Target, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { PredictionChart } from "@/components/gold/PredictionChart";
import { AuthDialog } from "@/components/gold/AuthDialog";
import { HistoryDrawer } from "@/components/gold/HistoryDrawer";
import {
  fetchPrediction, loadHistory, loadUser, modelLabel, pushHistory, saveHistory, saveUser,
  type AuthUser, type HistoryEntry, type ModelType, type PredictionResult,
} from "@/lib/gold";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gold Predictor — Dự đoán giá vàng bằng LSTM & ARIMA" },
      { name: "description", content: "Phân tích và dự đoán giá vàng bằng mô hình AI LSTM & ARIMA với biểu đồ trực quan, chỉ số RMSE/MAPE và đề xuất chiến lược." },
      { property: "og:title", content: "Gold Predictor" },
      { property: "og:description", content: "Dự đoán giá vàng với LSTM & ARIMA — biểu đồ, chỉ số đánh giá và gợi ý từ AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [model, setModel] = useState<ModelType>("LSTM");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    setUser(loadUser());
  }, []);

  const handleAnalyze = async () => {
    if (days < 1 || days > 30) {
      toast.error("Số ngày dự đoán phải từ 1 đến 30");
      return;
    }
    setLoading(true);
    const loadingToast = toast.loading("Đang khởi động máy chủ...");
    try {
      const r = await fetchPrediction(model, days, (message) => {
        toast.loading(message, { id: loadingToast });
      });
      setResult(r);
      const entry = pushHistory(r);
      setHistory((h) => [entry, ...h].slice(0, 100));
      toast.success("Phân tích hoàn tất", { id: loadingToast });
    } catch (e) {
      toast.error("Không thể lấy dữ liệu dự đoán. Hãy thử lại sau ít phút.", { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveHistory(next);
  };
  const deleteFiltered = (filter: "ALL" | ModelType) => {
    const next = filter === "ALL" ? [] : history.filter((h) => h.model !== filter);
    setHistory(next);
    saveHistory(next);
  };

  return (
    <div className="min-h-screen bg-background bg-page-gradient">
      <Header
        user={user}
        onLogin={() => setAuthOpen(true)}
        onLogout={() => { saveUser(null); setUser(null); toast.success("Đã đăng xuất"); }}
        onOpenHistory={() => setHistoryOpen(true)}
        historyCount={history.length}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <ControlPanel
          model={model}
          days={days}
          loading={loading}
          onModelChange={setModel}
          onDaysChange={setDays}
          onSubmit={handleAnalyze}
        />

        {result ? (
          <>
            <ChartCard result={result} />
            <MetricsGrid result={result} />
            <AIInsights result={result} />
          </>
        ) : (
          <EmptyState />
        )}
      </main>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuth={(u) => { saveUser(u); setUser(u); }}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        onDelete={deleteEntry}
        onDeleteFiltered={deleteFiltered}
        onReplay={(h) => { setResult(h); setModel(h.model); setDays(h.days); }}
      />
    </div>
  );
}

function Header({
  user, onLogin, onLogout, onOpenHistory, historyCount,
}: {
  user: AuthUser | null;
  onLogin: () => void;
  onLogout: () => void;
  onOpenHistory: () => void;
  historyCount: number;
}) {
  return (
    <header className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-gold flex items-center justify-center text-foreground font-bold text-lg shadow-gold shrink-0">
          AU
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gradient-title leading-tight">
          Gold Predictor
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Phân tích giá vàng bằng mô hình LSTM &amp; ARIMA
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onOpenHistory} className="gap-2">
            <HistoryIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Lịch sử</span>
            {historyCount > 0 && (
              <span className="ml-1 text-xs bg-gold-light text-foreground rounded-full px-2 py-0.5">
                {historyCount}
              </span>
            )}
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border border-border hover:bg-accent transition">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gradient-gold text-foreground text-sm font-semibold">
                      {user.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline">{user.name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive">
                  <LogOut className="w-4 h-4" /> Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={onLogin} className="bg-gradient-gold text-foreground shadow-gold hover:opacity-90 gap-2">
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng nhập</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
      <span className="w-1.5 h-6 bg-gradient-gold rounded-full" />
      {children}
    </h2>
  );
}

function ControlPanel({
  model, days, loading, onModelChange, onDaysChange, onSubmit,
}: {
  model: ModelType;
  days: number;
  loading: boolean;
  onModelChange: (m: ModelType) => void;
  onDaysChange: (d: number) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="bg-white/88 backdrop-blur-xl rounded-[2rem] border border-white/70 shadow-card p-6 transition-transform duration-300 ease-out hover:-translate-y-1 animate-fade-in-up">
      <SectionTitle>Bảng điều khiển</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <div className="space-y-2">
          <Label htmlFor="model">Mô hình phân tích</Label>
          <Select value={model} onValueChange={(v) => onModelChange(v as ModelType)}>
            <SelectTrigger id="model" className="h-11 bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LSTM">{modelLabel.LSTM}</SelectItem>
              <SelectItem value="ARIMA">{modelLabel.ARIMA}</SelectItem>
              <SelectItem value="LSTM_ARIMA">{modelLabel.LSTM_ARIMA}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="days">Số ngày muốn dự đoán</Label>
          <Input
            id="days"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => onDaysChange(Number(e.target.value))}
            className="h-11 bg-secondary/50"
          />
        </div>
        <Button
          onClick={onSubmit}
          disabled={loading}
          className="h-11 px-8 bg-gradient-to-r from-[#f8b64c] to-[#d1921d] text-foreground shadow-gold hover:-translate-y-0.5 transform transition-all duration-200 font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Đang phân tích...
            </>
          ) : (
            "Phân tích ngay"
          )}
        </Button>
      </div>
    </section>
  );
}

function ChartCard({ result }: { result: PredictionResult }) {
  return (
    <section className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-card border border-white/60 p-6 transition-transform duration-300 ease-out hover:-translate-y-1 animate-fade-in-up">
      <SectionTitle>Biểu đồ dự đoán giá vàng — {modelLabel[result.model]}</SectionTitle>
      <PredictionChart data={result.series} />
    </section>
  );
}

function MetricCard({
  label, value, sub, icon, tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "default" | "up" | "down" | "gold";
}) {
  const valueClass =
    tone === "up" ? "text-success" :
    tone === "down" ? "text-destructive" :
    tone === "gold" ? "text-gold-dark" :
    "text-foreground";
  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-[1.75rem] shadow-card p-5 border border-white/70 transition-transform duration-300 hover:-translate-y-1">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-3xl font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MetricsGrid({ result }: { result: PredictionResult }) {
  const TrendIcon = result.trend === "up" ? TrendingUp : TrendingDown;
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard label="Giá hiện tại" value={`$${result.currentPrice.toFixed(1)}`} sub="USD / oz" />
      <MetricCard
        label="Giá dự báo cuối kỳ"
        value={<span className="text-gold-dark">${result.finalPredicted.toFixed(1)}</span>}
        sub={`Sau ${result.days} ngày dự báo`}
        tone="gold"
      />
      <MetricCard
        label="Xu hướng"
        value={
          <span className="flex items-center gap-2">
            <TrendIcon className="w-7 h-7" />
            {result.trend === "up" ? "Tăng" : "Giảm"}
          </span>
        }
        sub="Dự báo ngắn hạn"
        tone={result.trend === "up" ? "up" : "down"}
      />
      <MetricCard
        label="Độ sai lệch RMSE"
        value={`± $${result.rmse.toFixed(2)}`}
        sub="Sai số tuyệt đối"
        icon={<Target className="w-4 h-4 text-gold-dark" />}
      />
      <MetricCard
        label="Độ sai lệch MAPE"
        value={`${result.mape.toFixed(2)}%`}
        sub="Sai số phần trăm"
        icon={<Percent className="w-4 h-4 text-gold-dark" />}
      />
    </section>
  );
}

function AIInsights({ result }: { result: PredictionResult }) {
  const reliability = useMemo(() => {
    if (result.mape < 1) return { label: "Tốt", tone: "text-success", desc: "Baseline có sai số thấp; chưa phải đánh giá riêng của model." };
    if (result.mape < 2.5) return { label: "Khá", tone: "text-success", desc: "Baseline có sai số tương đối thấp; cần đối chiếu backtest." };
    if (result.mape < 5) return { label: "Trung bình", tone: "text-gold-dark", desc: "Baseline chỉ mang tính tham khảo, cần thận trọng." };
    return { label: "Cao", tone: "text-destructive", desc: "Baseline có sai số cao; không nên xem là độ chính xác của model." };
  }, [result.mape]);

  const change = result.finalPredicted - result.currentPrice;
  const changePct = (change / result.currentPrice) * 100;
  const trendText = result.trend === "up" ? "TĂNG" : "GIẢM";
  const recommendation =
    result.trend === "up"
      ? `Mô hình ${modelLabel[result.model]} dự báo xu hướng ${trendText} khoảng ${Math.abs(changePct).toFixed(2)}% trong ${result.days} ngày tới. MAPE đang hiển thị là baseline tham chiếu, không phải độ chính xác riêng của model. Có thể cân nhắc nắm giữ / mua tích lũy ngắn hạn.`
      : `Mô hình ${modelLabel[result.model]} dự báo xu hướng ${trendText} khoảng ${Math.abs(changePct).toFixed(2)}% trong ${result.days} ngày tới. MAPE đang hiển thị là baseline tham chiếu, không phải độ chính xác riêng của model. Nhà đầu tư nên thận trọng, cân nhắc chốt lời hoặc chờ mua vào giá tốt hơn.`;

  // Prefer backend-provided recommendation/strategy if available
  const backendRecommendation = (result as any).recommendation || recommendation;
  const backendStrategy = (result as any).strategy_recommendation || ("Chiến lược đề xuất: " + recommendation);
  const signalLabel = (result as any).signal_label as { label?: string; class_name?: string } | undefined;
  const confidence = (result as any).confidence_label as { level?: string; score?: number } | undefined;

  return (
    <section className="bg-gradient-to-br from-white/90 via-[#fff9f1]/80 to-[#fff0e6]/80 rounded-[2rem] border border-white/70 shadow-card p-6 animate-fade-in-up">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-gold to-[#c59f37] flex items-center justify-center shadow-gold shrink-0">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold">Đề xuất từ mô hình phân tích tích hợp AI</h2>
          <p className="text-sm text-muted-foreground mt-1">Phân tích dựa trên kết quả mô hình hiện tại.</p>

          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            <div className="rounded-[1.75rem] bg-white/85 border border-white/70 p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Độ tin cậy</div>
                  <div className={`mt-2 text-lg font-semibold ${reliability.tone}`}>{reliability.label}</div>
                </div>
                {confidence && (
                  <div className="rounded-full bg-slate-950/5 px-3 py-1 text-xs font-semibold text-slate-700">
                    {(confidence.level || "--").toString()} · {confidence.score ?? "--"}
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{reliability.desc} (MAPE baseline {result.mape.toFixed(2)}%)</p>
            </div>
            <div className="rounded-[1.75rem] bg-white/85 border border-white/70 p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Chiến lược đề xuất</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{signalLabel?.label || "Hold"}</div>
                </div>
                {signalLabel && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${signalLabel.class_name === 'buy' ? 'bg-emerald-600' : signalLabel.class_name === 'sell' ? 'bg-rose-600' : 'bg-amber-500'}`}>
                    {signalLabel.label}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{backendStrategy}</p>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-2 text-xs text-muted-foreground border-t border-white/60 pt-4">
            <AlertTriangle className="w-4 h-4 text-gold-dark shrink-0 mt-0.5" />
            <span>
              <b>Lưu ý:</b> Dự báo từ các mô hình phân tích chỉ mang tính chất tham khảo, không phải lời khuyên đầu tư tài chính mang tính chính xác 100%.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] border border-dashed border-white/60 shadow-card p-16 text-center animate-fade-in-up">
      <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-br from-gold to-[#c59f37] flex items-center justify-center shadow-gold mb-5">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-semibold text-slate-900">Sẵn sàng phân tích giá vàng</h3>
      <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
        Chọn mô hình, nhập số ngày và nhấn <b>Phân tích ngay</b> để bắt đầu phân tích với AI.
      </p>
    </div>
  );
}
