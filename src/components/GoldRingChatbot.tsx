import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, X, Loader2 } from 'lucide-react';
import type { MLCEngineInterface } from '@mlc-ai/web-llm';

interface Msg { role: 'user' | 'model'; text: string; error?: boolean; }

const STORAGE_KEY = 'goldring_chat_history_v3';
const PREVIOUS_STORAGE_KEYS = ['goldring_chat_history', 'goldring_chat_history_v2'];
const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
const SYSTEM_PROMPT = 'Chỉ trả lời bằng tiếng Việt có dấu, tự nhiên và ngắn gọn. Không chèn ký tự lạ, không lặp dấu câu, không đổi sang ngôn ngữ khác. Bạn là trợ lý tư vấn về vàng. Không bịa giá vàng hiện tại, số liệu, tin tức hay nguồn tham khảo. Nếu người dùng hỏi giá hiện tại hoặc dữ liệu bạn không biết, hãy nói rõ bạn không có dữ liệu thời gian thực. Mọi nhận định đầu tư chỉ mang tính tham khảo, không cam kết lợi nhuận.';

function isValidVietnameseReply(reply: string): boolean {
  const letters = reply.match(/\p{L}/gu) ?? [];
  const latinLetters = letters.filter(letter => /\p{Script=Latin}/u.test(letter)).length;
  const hasVietnamese = /[ăâđêôơưĂÂĐÊÔƠƯàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/u.test(reply);
  const repeatsPunctuation = /([!?.,])\1{4,}/u.test(reply);

  return letters.length >= 4
    && latinLetters === letters.length
    && hasVietnamese
    && !repeatsPunctuation
    && (reply.match(/[\p{L}\p{N}]/gu)?.length ?? 0) / reply.length >= 0.5;
}

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
  const [modelStatus, setModelStatus] = useState('');
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [modelError, setModelError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MLCEngineInterface | null>(null);

  const getEngine = async (): Promise<MLCEngineInterface> => {
    if (engineRef.current) return engineRef.current;
    setModelError('');
    setModelProgress(null);
    setModelStatus(t('chatbot.checkingWebGPU'));
    let worker: Worker | undefined;
    try {
      const gpu = Reflect.get(navigator, 'gpu') as
        | { requestAdapter?: () => Promise<unknown> }
        | undefined;
      if (!window.isSecureContext || typeof gpu?.requestAdapter !== 'function') {
        throw new Error(t('chatbot.webGpuUnsupported'));
      }
      if (!await gpu.requestAdapter()) {
        throw new Error(t('chatbot.webGpuAdapterUnavailable'));
      }

      setModelStatus(t('chatbot.loadingModel'));
      worker = new Worker(new URL('../workers/webllm.worker.ts', import.meta.url), { type: 'module' });
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const engine = await CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: ({ progress }) => {
          const percent = Math.round(progress * 100);
          setModelProgress(percent);
          setModelStatus(t('chatbot.downloadingModel', { progress: percent }));
        },
      });
      engineRef.current = engine;
      setModelProgress(100);
      setModelStatus(t('chatbot.modelReady'));
      return engine;
    } catch (error) {
      worker?.terminate();
      setModelProgress(null);
      setModelStatus('');
      setModelError(error instanceof Error ? error.message : t('chatbot.unknownError'));
      throw error;
    }
  };

  useEffect(() => {
    try {
      PREVIOUS_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(isMessage)) {
          setMessages(parsed.map(message => {
            if (message.role !== 'model') return message;
            const isLegacyError = message.text === 'Có lỗi xảy ra khi kết nối.'
              || message.text.startsWith('Chatbot gặp lỗi:');
            return isLegacyError || !isValidVietnameseReply(message.text)
              ? { ...message, error: true }
              : message;
          }));
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
      const engine = await getEngine();
      setModelStatus(t('chatbot.thinking'));
      const history = next
        .filter(message => !message.error && (message.role === 'user' || isValidVietnameseReply(message.text)))
        .slice(-12)
        .map(({ role, text }) => ({
        role: role === 'model' ? 'assistant' as const : 'user' as const,
        content: text,
      }));
      const response = await engine.chat.completions.create({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        temperature: 0.35,
        top_p: 0.85,
        frequency_penalty: 0.2,
        max_tokens: 160,
      });
      const content = response.choices[0]?.message.content;
      const reply = typeof content === 'string' ? content.trim() : '';
      if (!isValidVietnameseReply(reply)) {
        throw new Error(t('chatbot.invalidResponse'));
      }
      setMessages(m => [...m, { role: 'model', text: reply }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Lỗi không xác định.';
      setMessages(m => [...m, { role: 'model', text: `Chatbot gặp lỗi: ${message}`, error: true }]);
    } finally {
      setLoading(false);
      if (engineRef.current) setModelStatus(t('chatbot.modelReady'));
    }
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
                <div className="text-[10px] opacity-80" aria-live="polite">
                  {modelStatus || t('chatbot.localModelNotice')}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="hover:bg-white/20 rounded-full p-1"><X size={20} /></button>
          </div>

          {modelError && (
            <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              <div className="font-semibold">{t('chatbot.modelLoadError')}</div>
              <div className="mt-1 break-words">{modelError}</div>
              <p className="mt-2">{t('chatbot.troubleshooting')}</p>
              <button
                type="button"
                onClick={() => setModelError('')}
                className="mt-2 underline underline-offset-2"
              >
                {t('chatbot.dismissError')}
              </button>
            </div>
          )}

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
                } break-words [overflow-wrap:anywhere]`}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-sm">💍</div>
                <div className="bg-white border border-yellow-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin text-yellow-600" size={16} />
                    <span className="text-xs text-gray-500">{modelStatus || t('chatbot.thinking')}</span>
                  </div>
                  {modelProgress !== null && (
                    <div aria-live="polite">
                      <div className="h-1.5 overflow-hidden rounded-full bg-yellow-100">
                        <div
                          role="progressbar"
                          aria-label={t('chatbot.modelDownloadProgress')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={modelProgress}
                          className="h-full bg-amber-500 transition-[width]"
                          style={{ width: `${modelProgress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">{t('chatbot.firstDownloadNotice')}</p>
                    </div>
                  )}
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
