import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon } from 'lucide-react';
import AuthModal from './AuthModal';
import LanguageSwitcher from './LanguageSwitcher';

export default function Navbar() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur border-b border-yellow-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🪙</span>
            <span className="font-bold text-lg bg-gradient-to-r from-yellow-600 to-amber-500 bg-clip-text text-transparent">
              GoldPrediction
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user ? (
              <div className="relative">
                <button onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-yellow-50">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white text-sm font-bold">
                    {user.email?.[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 hidden sm:inline">{user.email?.split('@')[0]}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border rounded-lg shadow-lg z-50">
                    <div className="px-4 py-3 border-b text-xs text-gray-500 truncate">{user.email}</div>
                    <button onClick={() => { signOut(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-red-600 text-sm">
                      <LogOut size={16} /> {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setAuthMode('login'); setAuthOpen(true); }}
                  className="px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50 rounded-lg">
                  {t('nav.login')}
                </button>
                <button onClick={() => { setAuthMode('register'); setAuthOpen(true); }}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-lg hover:opacity-90">
                  {t('nav.register')}
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <div className="h-16" />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </>
  );
}
