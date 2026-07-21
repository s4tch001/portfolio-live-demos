import { Link } from 'react-router-dom';

const SUPPORT_EMAIL = 'esl.educonnect@gmail.com';

// Renders a translated legal document (Privacy Policy / Terms of Service) from
// the structured data in i18n/legal.js. The brand name and support email are
// never translated.
export default function LegalDoc({ doc }) {
  return (
    <main className="legal-doc">
      <h1>{doc.title}</h1>
      <p className="legal-meta">
        <strong>Sunset-Speaks</strong>
        <br />
        {doc.effective}
      </p>
      {doc.sections.map((s, i) => (
        <section key={i}>
          <h2>{s.h}</h2>
          {s.blocks.map((b, j) => {
            if (b.p) return <p key={j}>{b.p}</p>;
            if (b.ul) {
              return (
                <ul key={j}>
                  {b.ul.map((li, k) => (
                    <li key={k}>{li}</li>
                  ))}
                </ul>
              );
            }
            if (b.privacyLink) {
              return (
                <p key={j}>
                  {b.privacyLink.pre}
                  <Link to="/privacy">{b.privacyLink.text}</Link>
                  {b.privacyLink.post}
                </p>
              );
            }
            if (b.contact) {
              return (
                <p key={j}>
                  {b.contact.intro}
                  <br />
                  Sunset-Speaks {b.contact.support}
                  <br />
                  {b.contact.emailLabel}:{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                </p>
              );
            }
            return null;
          })}
        </section>
      ))}
    </main>
  );
}
