import { LANGUAGES, useLang } from '../../i18n/LanguageProvider.jsx';

// Language selector (China build). Used on the landing page and in the
// hamburger menu; the choice is saved to the account (and localStorage).
export default function LanguageSwitcher({ className, style }) {
  const { lang, setLang } = useLang();
  return (
    <select
      className={className || 'form-control'}
      value={lang}
      onChange={(e) => setLang(e.target.value)}
      aria-label="Language"
      style={style}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
