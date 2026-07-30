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
    try {
      const r = await fetchPrediction(model, days);
      setResult(r);
      const entry = pushHistory(r);
      setHistory((h) => [entry, ...h].slice(0, 100));
      toast.success("Phân tích hoàn tất");
    } catch (e) {
      toast.error("Không thể lấy dữ liệu dự đoán");
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
    <div className="min-h-screen bg-background">
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
    <section className="bg-card rounded-2xl shadow-card p-6 border border-border">
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
          className="h-11 px-8 bg-gradient-gold text-foreground shadow-gold hover:opacity-90 font-semibold"
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
    <section className="bg-card rounded-2xl shadow-card p-6 border border-border">
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
    <div className="bg-card rounded-2xl shadow-card p-5 border border-border">
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
        label="Giá dự đoán cao nhất"
        value={<span className="text-gold-dark">${result.maxPredicted.toFixed(1)}</span>}
        sub="Trong khoảng dự đoán"
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
    if (result.mape < 1) return { label: "Rất cao", tone: "text-success", desc: "Mô hình có độ chính xác rất cao." };
    if (result.mape < 2.5) return { label: "Cao", tone: "text-success", desc: "Sai số ở mức thấp, đáng tin cậy." };
    if (result.mape < 5) return { label: "Trung bình", tone: "text-gold-dark", desc: "Có thể tham khảo nhưng cần thận trọng." };
    return { label: "Thấp", tone: "text-destructive", desc: "Sai số cao — chỉ nên dùng như tham khảo phụ." };
  }, [result.mape]);

  const change = result.maxPredicted - result.currentPrice;
  const changePct = (change / result.currentPrice) * 100;
  const trendText = result.trend === "up" ? "TĂNG" : "GIẢM";
  const recommendation =
    result.trend === "up"
      ? `Mô hình ${modelLabel[result.model]} dự báo xu hướng ${trendText} khoảng ${Math.abs(changePct).toFixed(2)}% trong ${result.days} ngày tới với MAPE ${result.mape.toFixed(2)}%. Có thể cân nhắc nắm giữ / mua tích lũy ngắn hạn.`
      : `Mô hình ${modelLabel[result.model]} dự báo xu hướng ${trendText} khoảng ${Math.abs(changePct).toFixed(2)}% trong ${result.days} ngày tới với MAPE ${result.mape.toFixed(2)}%. Nhà đầu tư nên thận trọng, cân nhắc chốt lời hoặc chờ mua vào giá tốt hơn.`;

  return (
    <section className="rounded-2xl border border-gold-light/60 bg-gradient-to-br from-accent/60 via-card to-card p-6 shadow-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-gold flex items-center justify-center shadow-gold shrink-0">
          <Sparkles className="w-6 h-6 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">Đề xuất từ mô hình phân tích tích hợp AI</h2>
          <p className="text-sm text-muted-foreground">Phân tích dựa trên kết quả mô hình hiện tại.</p>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-xl bg-card border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Độ tin cậy mô hình</div>
              <div className={`mt-1 text-xl font-bold ${reliability.tone}`}>{reliability.label}</div>
              <p className="text-sm text-muted-foreground mt-1">{reliability.desc} (MAPE {result.mape.toFixed(2)}%)</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Khuyến nghị chiến lược</div>
              <p className="mt-1 text-sm leading-relaxed">{recommendation}</p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground border-t border-border pt-3">
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
    <div className="bg-card rounded-2xl shadow-card p-16 border border-border border-dashed text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-gold flex items-center justify-center shadow-gold mb-4">
        <Sparkles className="w-7 h-7 text-foreground" />
      </div>
      <h3 className="text-lg font-semibold">Sẵn sàng phân tích giá vàng</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Chọn mô hình, nhập số ngày và nhấn <b>Phân tích ngay</b> để bắt đầu.
      </p>
    </div>
  );
}
