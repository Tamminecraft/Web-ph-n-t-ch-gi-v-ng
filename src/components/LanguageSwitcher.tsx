import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useState } from 'react';

const langs = [
  { code: 'vi', label: '🇻🇳 Tiếng Việt' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'zh', label: '🇨🇳 中文' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = langs.find(l => l.code === i18n.language.split('-')[0]) ?? langs[0];

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-yellow-50 text-gray-700">
        <Globe size={18} /> <span className="text-sm">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white border rounded-lg shadow-lg z-50">
          {langs.map(l => (
            <button key={l.code}
              onClick={() => { i18n.changeLanguage(l.code); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-yellow-50 text-sm">
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
