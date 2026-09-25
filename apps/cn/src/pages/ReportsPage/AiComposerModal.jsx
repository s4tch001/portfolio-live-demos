import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { apiFetch } from '../../lib/apiClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

const EMPTY_USAGE = { used: 0, remaining: 10, limit: 10, resets_at: '' };

export default function AiComposerModal({ open, onClose, session, classDuration }) {
  const toast = useToast();
  const t = useT();
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [usage, setUsage] = useState(EMPTY_USAGE);
  const [usageLoading, setUsageLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      requestVersion.current += 1;
      inFlight.current = false;
      setBusy(false);
      return undefined;
    }
    let active = true;
    setNotes('');
    setDraft('');
    setExpanded(false);
    setUsageLoading(true);
    apiFetch('/ai/compose-report/usage').then((result) => {
      if (!active) return;
      setUsage(result.usage || EMPTY_USAGE);
      setAvailable(result.available === true);
    }).catch(() => {
      if (active) setAvailable(false);
    }).finally(() => {
      if (active) setUsageLoading(false);
    });
    return () => { active = false; };
  }, [open, session?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !usage.resets_at) return undefined;
    const delay = new Date(usage.resets_at).getTime() - Date.now() + 1000;
    if (!Number.isFinite(delay) || delay <= 0) return undefined;
    const timer = window.setTimeout(() => {
      apiFetch('/ai/compose-report/usage').then((result) => {
        if (result?.usage) setUsage(result.usage);
        setAvailable(result?.available === true);
      }).catch(() => setAvailable(false));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open, usage.resets_at]);

  const resetTime = usage.resets_at
    ? new Date(usage.resets_at).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '8:00 AM';

  const generate = async () => {
    if (inFlight.current || !session) return;
    if (!notes.trim()) return toast(t('ai.notesRequired'));
    inFlight.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    setDraft('');
    try {
      const result = await apiFetch('/ai/compose-report', 'POST', {
        schedule_id: session.id,
        notes: notes.trim(),
        class_duration: classDuration.trim(),
      });
      if (version !== requestVersion.current) return;
      if (!result?.report) throw new Error(t('ai.unavailable'));
      setUsage(result.usage || usage);
      setDraft(result.report);
    } catch (error) {
      if (version !== requestVersion.current) return;
      if (error.data?.usage) setUsage(error.data.usage);
      const message = {
        ai_daily_limit: t('ai.limitReached'),
        ai_demo_daily_limit: t('ai.demoLimit'),
        ai_cooldown: t('ai.cooldown'),
        ai_provider_busy: t('ai.providerBusy'),
        ai_not_configured: t('ai.notConfigured'),
      }[error.message] || t('ai.unavailable');
      if (error.message === 'ai_daily_limit') setUsage((value) => ({ ...value, remaining: 0 }));
      toast(message);
    } finally {
      if (version === requestVersion.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  const copyDraft = async () => {
    if (!draft.trim()) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(draft);
      copied = true;
    } catch (_) { /* Some mobile browsers need a legacy copy fallback. */ }
    if (!copied) {
      const temporary = document.createElement('textarea');
      temporary.value = draft;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.focus();
      temporary.select();
      try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
      temporary.remove();
    }
    toast(copied ? t('ai.copied') : t('ai.copyFailed'));
  };

  return (
    <Modal open={open} onClose={onClose} title={t('ai.title')} maxWidth="720px" closeOnOverlay={false}>
      <div className="modal-body ai-feedback-body">
        <div className={'ai-usage' + (usage.remaining === 0 ? ' exhausted' : '')}>
          <div className="ai-usage-count">
            <i className="fa-solid fa-bolt" aria-hidden="true" />
            <strong>{usageLoading ? '—' : `${usage.remaining}/${usage.limit}`}</strong>
            <span>{t('ai.remaining')}</span>
          </div>
          <div className="ai-usage-info">{t('ai.resets', { time: resetTime })}</div>
        </div>
        {!usageLoading && !available && <p className="ai-preview-note" role="status">{t('ai.notConfigured')}</p>}
        <div className="form-group">
          <label htmlFor="ai-feedback-notes">{t('ai.notes')}</label>
          <textarea
            id="ai-feedback-notes"
            className={'form-control ai-feedback-notes' + (expanded ? ' expanded' : '')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={4000}
            placeholder={t('ai.notesPlaceholder')}
          />
          <div className="ai-feedback-notes-help">
            <span className="ai-composer-hint">{t('ai.notesHint')}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpanded((value) => !value)} aria-pressed={expanded}>
              {expanded ? t('ai.shrink') : t('ai.expand')}
            </button>
          </div>
        </div>
        {draft && <div className="form-group">
          <label htmlFor="ai-feedback-result">{t('ai.generated')}</label>
          <p className="ai-preview-note">{t('ai.review')}</p>
          <textarea id="ai-feedback-result" className="form-control ai-feedback-result"
            value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} />
        </div>}
      </div>
      <div className="modal-footer ai-feedback-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.close')}</button>
        <button type="button" className="btn btn-outline" onClick={copyDraft} disabled={!draft.trim()}>
          <i className="fa-solid fa-copy" aria-hidden="true" /> {t('ai.copy')}
        </button>
        <button type="button" className="btn btn-primary" onClick={generate}
          disabled={busy || usageLoading || !available || usage.remaining <= 0 || !notes.trim()} aria-busy={busy}>
          <i className={busy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'} aria-hidden="true" />
          {' '}{busy ? t('ai.generating') : t('ai.generate')}
        </button>
      </div>
    </Modal>
  );
}
