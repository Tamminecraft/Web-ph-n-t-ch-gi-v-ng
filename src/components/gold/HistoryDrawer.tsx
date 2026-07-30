import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Eye, TrendingUp, TrendingDown, History as HistoryIcon } from "lucide-react";
import { modelLabel, type HistoryEntry, type ModelType } from "@/lib/gold";
import { toast } from "sonner";

type Filter = "ALL" | ModelType;

export function HistoryDrawer({
  open,
  onOpenChange,
  history,
  onDelete,
  onDeleteFiltered,
  onReplay,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  history: HistoryEntry[];
  onDelete: (id: string) => void;
  onDeleteFiltered: (filter: Filter) => void;
  onReplay: (entry: HistoryEntry) => void;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const filtered = useMemo(
    () => (filter === "ALL" ? history : history.filter((h) => h.model === filter)),
    [history, filter],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-gold-dark" />
            Lịch sử phân tích
          </SheetTitle>
          <SheetDescription>Xem lại các lần phân tích và tải lại lên biểu đồ.</SheetDescription>
        </SheetHeader>

        <div className="px-4 flex flex-col sm:flex-row gap-3 mt-6">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả mô hình</SelectItem>
              <SelectItem value="LSTM">LSTM</SelectItem>
              <SelectItem value="ARIMA">ARIMA</SelectItem>
              <SelectItem value="LSTM_ARIMA">Mô hình kết hợp LSTM_ARIMA</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="destructive"
            className="sm:ml-auto"
            disabled={filtered.length === 0}
            onClick={() => {
              onDeleteFiltered(filter);
              toast.success(
                filter === "ALL"
                  ? "Đã xóa toàn bộ lịch sử"
                  : `Đã xóa lịch sử của ${modelLabel[filter]}`,
              );
            }}
          >
            <Trash2 className="w-4 h-4" />
            {filter === "ALL" ? "Xóa tất cả" : `Xóa tất cả của ${filter}`}
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Chưa có bản ghi lịch sử nào.
            </div>
          ) : (
            filtered.map((h) => (
              <div key={h.id} className="rounded-xl border border-border p-4 shadow-card bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-gradient-gold text-foreground border-0">{modelLabel[h.model]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Dự đoán <b className="text-foreground">{h.days}</b> ngày
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="text-muted-foreground">Hiện tại</span>{" "}
                      <b>${h.currentPrice.toFixed(2)}</b>{" "}
                      <span className="text-muted-foreground">→ Dự đoán</span>{" "}
                      <b className={h.trend === "up" ? "text-success" : "text-destructive"}>
                        ${h.maxPredicted.toFixed(2)}
                      </b>{" "}
                      {h.trend === "up" ? (
                        <TrendingUp className="inline w-4 h-4 text-success" />
                      ) : (
                        <TrendingDown className="inline w-4 h-4 text-destructive" />
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      RMSE ±${h.rmse.toFixed(2)} · MAPE {h.mape.toFixed(2)}%
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { onReplay(h); onOpenChange(false); }}>
                      <Eye className="w-4 h-4" /> Xem lại
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => { onDelete(h.id); toast.success("Đã xóa bản ghi"); }}
                    >
                      <Trash2 className="w-4 h-4" /> Xóa
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
