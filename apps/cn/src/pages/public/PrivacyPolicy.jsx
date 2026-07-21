import { useEffect } from 'react';
import PublicHeader from '../../components/Layout/PublicHeader.jsx';
import LegalDoc from './LegalDoc.jsx';
import { PRIVACY } from '../../i18n/legal.js';
import { useLang } from '../../i18n/LanguageProvider.jsx';

export default function PrivacyPolicy() {
  const { lang } = useLang();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="public-page">
      <PublicHeader />
      <LegalDoc doc={PRIVACY[lang] || PRIVACY.us} />
    </div>
  );
}
