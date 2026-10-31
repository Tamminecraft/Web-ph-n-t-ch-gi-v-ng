import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, X, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/gold';

interface Msg { role: 'user' | 'model'; text: string; error?: boolean; }

const STORAGE_KEY = 'goldring_chat_history';

function isMessage(value: unknown): value is Msg {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (message.role === 'user' || message.role === 'model')
    && typeof message.text === 'string'
    && (message.error === undefined || typeof message.error === 'boolean');
}

export default function GoldRingChatbot() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(isMessage)) {
          setMessages(parsed.map(message =>
            message.role === 'model'
              && (message.text === 'Có lỗi xảy ra khi kết nối.' || message.text.startsWith('Chatbot gặp lỗi:'))
              ? { ...message, error: true }
              : message
          ));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const next = [...messages, { role: 'user' as const, text: userMsg }];
    setMessages(next);
    setLoading(true);

    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter(message => !message.error).slice(-20).map(({ role, text }) => ({ role, text })),
        }),
        signal: AbortSignal.timeout(35000),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data && typeof data === 'object' && 'detail' in data
          && typeof data.detail === 'string'
          ? data.detail
          : `Máy chủ chatbot trả về lỗi HTTP ${res.status}.`;
        throw new Error(detail);
      }
      if (!data || typeof data !== 'object' || !('reply' in data)
        || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('Máy chủ chatbot không trả về câu trả lời hợp lệ.');
      }
      const reply = data.reply.trim();
      setMessages(m => [...m, { role: 'model', text: reply }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Lỗi không xác định.';
      setMessages(m => [...m, { role: 'model', text: `Chatbot gặp lỗi: ${message}`, error: true }]);
    } finally { setLoading(false); }
  };

  const displayMsgs = messages.length === 0
    ? [{ role: 'model' as const, text: t('chatbot.welcome') }]
    : messages;

  return (
    <>
      {/* Floating button */}
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg hover:scale-110 transition-transform flex items-center justify-center text-3xl border-4 border-yellow-200">
        💍
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[92vw] sm:w-96 h-[70vh] bg-white rounded-2xl shadow-2xl flex flex-col border-2 border-yellow-300 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-yellow-500 to-amber-500 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-2xl">💍</div>
              <div>
                <div className="font-bold">{t('chatbot.title')}</div>
                <div className="text-xs opacity-90">{t('chatbot.subtitle')}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="hover:bg-white/20 rounded-full p-1"><X size={20} /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-yellow-50/30">
            {displayMsgs.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'model' && <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-sm shrink-0">💍</div>}
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.error
                    ? 'bg-red-50 border border-red-200 text-red-800 rounded-bl-sm'
                    : m.role === 'user'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-br-sm'
                    : 'bg-white border border-yellow-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-sm">💍</div>
                <div className="bg-white border border-yellow-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="animate-spin text-yellow-600" size={16} />
                  <span className="text-xs text-gray-500">Đang suy ngẫm...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t bg-white flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={t('chatbot.placeholder')} disabled={loading}
              className="flex-1 px-4 py-2 border rounded-full text-sm focus:outline-none focus:border-yellow-500" />
            <button onClick={send} disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500 text-white flex items-center justify-center disabled:opacity-50">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
