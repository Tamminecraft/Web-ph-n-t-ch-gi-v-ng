import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chatWithGoldRing } from "@/lib/chat.functions";
import { X, Send, Loader2 } from "lucide-react";
import goldRing from "@/assets/gold-ring.png";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "gold-ring-chat-v1";
const WELCOME: Msg = {
  role: "assistant",
  content:
    "Xin chào! Tôi là Chiếc Nhẫn Vàng thần kỳ ✨ — chuyên gia tài chính & thị trường vàng. Bạn muốn hỏi gì về giá vàng, đầu tư hay kinh tế vĩ mô hôm nay?",
};

export function GoldRingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { reply } = await chatWithGoldRing({
        data: { messages: next.map((m) => ({ role: m.role, content: m.content })) },
      });
      setMessages((cur) => [...cur, { role: "assistant", content: reply || "..." }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra";
      toast.error(msg);
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: "Xin lỗi, tôi đang gặp sự cố. " + msg },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([WELCOME]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  return (
    <>
      {/* FAB */}
      <button
        aria-label="Mở trợ lý Chiếc Nhẫn Vàng"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full bg-gradient-to-br from-[oklch(0.88_0.16_85)] to-[oklch(0.55_0.14_70)] shadow-lg shadow-amber-500/40 transition hover:scale-105 hover:shadow-xl"
      >
        <img src={goldRing} alt="Chiếc Nhẫn Vàng" className="h-full w-full object-contain p-2 drop-shadow" />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[560px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-[oklch(0.95_0.08_85)] to-background px-4 py-3">
            <div className="flex items-center gap-2">
              <img src={goldRing} alt="" className="h-8 w-8" />
              <div>
                <div className="text-sm font-bold">Chiếc Nhẫn Vàng</div>
                <div className="text-[11px] text-muted-foreground">Cố vấn tài chính thần kỳ</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={reset} className="text-xs">
                Mới
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="space-y-3 p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {m.role === "assistant" && (
                    <img src={goldRing} alt="" className="h-7 w-7 flex-shrink-0" />
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <img src={goldRing} alt="" className="h-7 w-7" />
                  <div className="rounded-2xl bg-muted px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t bg-background p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi về giá vàng, đầu tư..."
              disabled={loading}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}