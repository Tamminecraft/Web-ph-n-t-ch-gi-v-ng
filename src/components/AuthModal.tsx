import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { X } from 'lucide-react';

type Mode = 'login' | 'register' | 'forgot' | 'otp';

export default function AuthModal({ open, onClose, initialMode = 'login' }: {
  open: boolean; onClose: () => void; initialMode?: Mode;
}) {
  const { t } = useTranslation();
  const { signIn, signUp, signInWithGoogle, sendPasswordResetOtp, verifyOtpAndResetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!open) return null;

  const handle = async (fn: () => Promise<{ error: any }>, successText?: string) => {
    setLoading(true); setMsg(null);
    const { error } = await fn();
    setLoading(false);
    if (error) setMsg({ type: 'err', text: error.message });
    else if (successText) setMsg({ type: 'ok', text: successText });
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-yellow-600 to-amber-500 bg-clip-text text-transparent">
          {mode === 'login' && t('auth.login')}
          {mode === 'register' && t('auth.register')}
          {mode === 'forgot' && t('auth.forgotPassword')}
          {mode === 'otp' && t('auth.resetPassword')}
        </h2>

        {msg && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {msg.text}
          </div>
        )}

        {(mode === 'login' || mode === 'register') && (
          <>
            <button onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 border-2 rounded-lg py-2.5 hover:bg-gray-50 mb-4">
              <img src="https://www.google.com/favicon.ico" alt="" className="w-5 h-5" />
              <span className="text-sm font-medium">{t('auth.loginWithGoogle')}</span>
            </button>
            <div className="text-center text-xs text-gray-400 mb-4">— {t('auth.orContinueWith')} —</div>
          </>
        )}

        <div className="space-y-3">
          <input type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:border-yellow-500" />

          {(mode === 'login' || mode === 'register') && (
            <input type="password" placeholder={t('auth.password')} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:border-yellow-500" />
          )}

          {mode === 'otp' && (
            <>
              <input type="text" maxLength={6} placeholder={t('auth.otpCode')} value={otp} onChange={e => setOtp(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:border-yellow-500 tracking-widest text-center" />
              <input type="password" placeholder={t('auth.newPassword')} value={newPass} onChange={e => setNewPass(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:border-yellow-500" />
            </>
          )}

          <button disabled={loading} onClick={() => {
            if (mode === 'login') handle(() => signIn(email, password));
            else if (mode === 'register') handle(() => signUp(email, password), 'Kiểm tra email để xác nhận!');
            else if (mode === 'forgot') handle(async () => {
              const r = await sendPasswordResetOtp(email);
              if (!r.error) setMode('otp');
              return r;
            }, 'Đã gửi mã OTP đến email của bạn!');
            else if (mode === 'otp') handle(() => verifyOtpAndResetPassword(email, otp, newPass), 'Đổi mật khẩu thành công!');
          }}
            className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 text-white py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
            {loading ? '...' :
              mode === 'login' ? t('auth.login') :
              mode === 'register' ? t('auth.register') :
              mode === 'forgot' ? t('auth.sendOtp') :
              t('auth.resetPassword')}
          </button>
        </div>

        <div className="mt-4 text-center text-sm space-y-2">
          {mode === 'login' && (
            <>
              <button onClick={() => setMode('forgot')} className="text-yellow-600 hover:underline block w-full">
                {t('auth.forgotPassword')}
              </button>
              <div>{t('auth.noAccount')} <button onClick={() => setMode('register')} className="text-yellow-600 font-medium hover:underline">{t('auth.register')}</button></div>
            </>
          )}
          {mode === 'register' && (
            <div>{t('auth.hasAccount')} <button onClick={() => setMode('login')} className="text-yellow-600 font-medium hover:underline">{t('auth.login')}</button></div>
          )}
          {(mode === 'forgot' || mode === 'otp') && (
            <button onClick={() => setMode('login')} className="text-gray-500 hover:underline">← {t('auth.backToLogin')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
