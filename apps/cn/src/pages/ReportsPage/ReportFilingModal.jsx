import { useState, useEffect, useRef } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Lightbox from '../../components/ui/Lightbox.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { uploadFile } from '../../lib/apiClient.js';
import { apiFetch } from '../../lib/apiClient.js';
import { sanitizeReportHtml, imageToWebP } from '../../lib/format.js';
import { stripReportHtml, normalizeSafeUrl } from '../../lib/reportHelpers.js';
import { getDefaultClassDuration } from '../../lib/scheduleHelpers.js';
import { getHistory, pushHistory } from '../../lib/inputHistory.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Free-text report fields that remember past entries (browser-like autofill via
// <datalist>). Excludes Link and the Lesson Memo & Feedback editor by design.
const HISTORY_FIELDS = ['book', 'pages', 'classDuration', 'absentOther'];

const ABSENT_REASONS = ['Late Notice', 'No Notice', 'Other'];

// Compose / edit a class report (legacy modal-report + submitReport + drafts).
// The rich-text editor is an UNCONTROLLED contentEditable (ref) — React must not
// re-render its children, or the caret/selection breaks.
export default function ReportFilingModal({ open, onClose, session }) {
  const data = useData();
  const toast = useToast();
  const { user } = useAuth();
  const t = useT();
  const editorRef = useRef(null);
  const fileRef = useRef(null);

  const [absent, setAbsent] = useState(false);
  const [absentReason, setAbsentReason] = useState('');
  const [absentOther, setAbsentOther] = useState('');
  const [book, setBook] = useState('');
  const [pages, setPages] = useState('');
  const [classDuration, setClassDuration] = useState('');
  const [link, setLink] = useState('');
  const [images, setImages] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // Per-field autofill suggestions (localStorage), refreshed on open and after submit.
  const [history, setHistory] = useState({});
  const loadHistory = () => {
    const uid = user?.id;
    const next = {};
    for (const f of HISTORY_FIELDS) next[f] = getHistory(uid, f);
    setHistory(next);
  };
  // Remember the current free-text inputs (browser-like autofill) and refresh the
  // suggestions. Called on both Submit and Save Draft.
  const saveInputHistory = () => {
    const uid = user?.id;
    pushHistory(uid, 'book', book);
    pushHistory(uid, 'pages', pages);
    pushHistory(uid, 'classDuration', classDuration);
    if (absent && absentReason === 'Other') pushHistory(uid, 'absentOther', absentOther);
    loadHistory();
  };
  const [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [draftNote, setDraftNote] = useState(null);
  // Which required fields are missing (drives the red highlight on submit).
  const [errors, setErrors] = useState({});
  const clearErr = (k) => setErrors((e) => (e[k] ? { ...e, [k]: false } : e));

  const existingReport = session ? data.getReportForSchedule(session.id) : null;

  // Populate the form on open (draft takes precedence over a filed report).
  useEffect(() => {
    if (!open || !session) return;
    const draft = data.getDraftForSchedule(session.id);
    const src = draft || existingReport || {};
    setAbsent(!!src.absent);
    setAbsentReason(src.absent_reason || '');
    setAbsentOther(src.absent_other || '');
    setBook(src.book || '');
    setPages(src.pages || '');
    setClassDuration(src.class_duration || getDefaultClassDuration(session.timeslot));
    setLink(src.link || '');
    setImages(Array.isArray(src.images) ? src.images.slice() : []);
    setUploadStatus('');
    setBusy(false);
    setSavingDraft(false);
    setErrors({});
    setDraftNote(draft ? t('reportM.draftLoaded') : null);
    loadHistory();
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeReportHtml(src.content || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session]);

  const onPaste = (e) => {
    // Paste as plain text, preserving line breaks (legacy editor paste handler).
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = document.createDocumentFragment();
    let last = null;
    text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
      if (i > 0) {
        last = document.createElement('br');
        frag.appendChild(last);
      }
      if (line) {
        last = document.createTextNode(line);
        frag.appendChild(last);
      }
    });
    if (!last) return;
    range.insertNode(frag);
    range.setStartAfter(last);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /^image\//i.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(f.name || ''));
    if (!files.length) {
      toast(t('reportM.chooseImages'));
      return;
    }
    setUploadStatus(t('reportM.converting', { n: files.length }));
    let uploaded = 0;
    for (const f of files) {
      try {
        const webp = await imageToWebP(f);
        const url = await uploadFile(webp);
        setImages((prev) => [...prev, url]);
        uploaded++;
        setUploadStatus(t('reportM.uploadedProgress', { done: uploaded, total: files.length }));
      } catch (err) {
        toast((f.name || 'image') + ': ' + (err.message || t('reportM.uploadFailed')));
      }
    }
    setUploadStatus(t('reportM.uploadedCount', { n: uploaded }));
    if (uploaded) {
      toast(t('reportM.uploadedCount', { n: uploaded }));
      clearErr('images');
    }
  };

  const removeImage = (idx) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    toast(t('reportM.imageRemoved'));
  };

  // Drag-and-drop onto the upload dropzone (ported from v12 handleImageDrag*).
  const onDropZoneDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDropZoneDragLeave = (e) => {
    // Ignore leaves into a child element of the dropzone.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragActive(false);
  };
  const onDropZoneDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer?.files);
  };

  // Paste a copied image with Ctrl+V while the upload window is open (ported from
  // v12 handleImagePaste). Gated on uploadOpen so it never steals the report
  // editor's text paste.
  useEffect(() => {
    if (!uploadOpen) return undefined;
    const onDocPaste = (e) => {
      const items = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter(Boolean);
      const files = items.length ? items : Array.from(e.clipboardData?.files || []);
      if (!files.length) return;
      e.preventDefault();
      handleFiles(files);
    };
    document.addEventListener('paste', onDocPaste);
    return () => document.removeEventListener('paste', onDocPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadOpen]);

  // While the upload modal is open, Escape closes only it (not the whole report).
  // Capture phase + stopImmediatePropagation pre-empts the report Modal's handler.
  useEffect(() => {
    if (!uploadOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setUploadOpen(false);
        setDragActive(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [uploadOpen]);

  const collectPayload = (normalizedLink) => ({
    schedule_id: session.id,
    teacher_id: session.teacher_id || user.id,
    content: editorRef.current ? editorRef.current.innerHTML : '',
    absent,
    book: book.trim(),
    pages: pages.trim(),
    class_duration: classDuration.trim(),
    absent_reason: absent ? absentReason : '',
    absent_other: absent && absentReason === 'Other' ? absentOther.trim() : '',
    images: images.slice(),
    link: normalizedLink,
    tracker_remarks: absent ? '50' : '100',
    date: session.date,
  });

  const saveDraft = async () => {
    setSavingDraft(true);
    const payload = collectPayload(link.trim());
    try {
      const res = await apiFetch('/report-drafts', 'POST', payload);
      const draft = {
        ...payload,
        id: data.getDraftForSchedule(session.id)?.id || Date.now(),
        updated_at: res?.updated_at || new Date().toISOString(),
      };
      data.upsertDraft(draft);
      saveInputHistory();
      setDraftNote(t('reportM.draftSavedNote'));
      toast(t('reportM.draftSavedToast'));
    } catch (e) {
      toast(t('reportM.draftFailed', { err: e.message || t('reportM.serverError') }));
    } finally {
      setSavingDraft(false);
    }
  };

  const submit = async () => {
    const content = editorRef.current ? editorRef.current.innerHTML : '';
    const reportText = stripReportHtml(content);
    const rawLink = link.trim();
    const normLink = rawLink ? normalizeSafeUrl(rawLink) : '';
    if (rawLink && !normLink) {
      toast(t('reportM.linkInvalid'));
      return;
    }
    // Validation (legacy validateReportBeforeSubmit) — highlight every missing
    // required field at once, then point the user at the first one.
    const err = {
      book: !book.trim(),
      pages: !pages.trim(),
      classDuration: !classDuration.trim(),
      images: !images.length,
      content: !absent && !reportText,
      absentReason: absent && !absentReason,
      absentOther: absent && absentReason === 'Other' && !absentOther.trim(),
    };
    setErrors(err);
    if (err.book || err.pages || err.classDuration) {
      toast(t('reportM.completeRequired'));
      return;
    }
    if (err.images) {
      toast(t('reportM.uploadAtLeastOne'));
      return;
    }
    if (err.content) {
      toast(t('reportM.writeMemo'));
      return;
    }
    if (err.absentReason) {
      toast(t('reportM.chooseAbsenceReason'));
      return;
    }
    if (err.absentOther) {
      toast(t('reportM.typeAbsenceReason'));
      return;
    }

    setBusy(true);
    const payload = collectPayload(normLink);
    try {
      if (existingReport) {
        const res = await apiFetch(`/reports/${existingReport.id}`, 'PUT', payload);
        data.upsertReport({
          ...existingReport,
          ...payload,
          submitted_at: res?.submitted_at || existingReport.submitted_at,
        });
      } else {
        const res = await apiFetch('/reports', 'POST', payload);
        data.upsertReport({
          ...payload,
          id: res && res.id ? res.id : Date.now(),
          submitted_at: res?.submitted_at || new Date().toISOString(),
        });
      }
      await apiFetch(`/report-drafts/${session.id}`, 'DELETE').catch(() => {});
      data.removeDraft(session.id);
      saveInputHistory();
      toast(t('reportM.submitted'));
      onClose();
    } catch (e) {
      toast(t('reportM.saveFailed', { err: e.message || t('reportM.serverError') }));
    } finally {
      setBusy(false);
    }
  };

  if (!session) return null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={existingReport ? t('reportM.editTitle') : t('reportM.composeTitle')}
        maxWidth="680px"
        closeOnOverlay={false}
      >
        <div className="modal-body">
          {draftNote && <div className="draft-note">{draftNote}</div>}
          <div className="form-group">
            <label>{t('report.link')}</label>
            <input
              type="url"
              className="form-control"
              placeholder="https://example.com/class-recording"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div className="report-form-grid">
            <div className="form-group">
              <label>{t('report.material')}</label>
              <input
                type="text"
                className={'form-control' + (errors.book ? ' required-error' : '')}
                placeholder={t('reportM.materialPh')}
                list="report-hist-book"
                value={book}
                onChange={(e) => { setBook(e.target.value); clearErr('book'); }}
              />
              <DatalistOptions id="report-hist-book" values={history.book} />
            </div>
            <div className="form-group">
              <label>{t('report.pages')}</label>
              <input
                type="text"
                className={'form-control' + (errors.pages ? ' required-error' : '')}
                placeholder={t('reportM.pagesPh')}
                list="report-hist-pages"
                value={pages}
                onChange={(e) => { setPages(e.target.value); clearErr('pages'); }}
              />
              <DatalistOptions id="report-hist-pages" values={history.pages} />
            </div>
          </div>
          <div className="form-group">
            <label>{t('report.duration')}</label>
            <input
              type="text"
              className={'form-control' + (errors.classDuration ? ' required-error' : '')}
              placeholder={t('reportM.durationPh')}
              list="report-hist-classDuration"
              value={classDuration}
              onChange={(e) => { setClassDuration(e.target.value); clearErr('classDuration'); }}
            />
            <DatalistOptions id="report-hist-classDuration" values={history.classDuration} />
          </div>
          <div className="form-group">
            <label>{t('report.memo')}</label>
            <div
              ref={editorRef}
              className={'report-editor' + (errors.content ? ' required-error' : '')}
              contentEditable
              suppressContentEditableWarning
              onPaste={onPaste}
              onInput={() => clearErr('content')}
              data-placeholder={t('reportM.editorPh')}
            ></div>
          </div>
          <div className="form-group">
            <label>{t('reportM.images')}</label>
            {uploadStatus && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>{uploadStatus}</div>
            )}
            <div className="upload-action-row">
              <button type="button" className={'btn btn-secondary' + (errors.images ? ' required-error' : '')} onClick={() => setUploadOpen(true)}>
                <i className="fa-solid fa-images" aria-hidden="true"></i> {t('reportM.uploadImages')}
              </button>
              <span className="upload-action-hint">{t('reportM.uploadHint')}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="upload-preview">
              {images.map((url, idx) => (
                <div className="upload-thumb-wrap" key={idx}>
                  <img className="upload-thumb" src={url} alt={t('reportM.imageAlt', { n: idx + 1 })} onClick={() => setLightbox(url)} />
                  <button
                    type="button"
                    className="upload-thumb-remove"
                    aria-label={t('reportM.removeImage')}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(idx);
                    }}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>{t('reportM.markAbsent')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={absent}
                onChange={(e) => {
                  setAbsent(e.target.checked);
                  if (!e.target.checked) {
                    setAbsentReason('');
                    setAbsentOther('');
                  }
                }}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>
                {t('reportM.absentCheckHint')}
              </span>
            </div>
            <div className={'absent-reason-box' + (absent ? ' open' : '') + ((errors.absentReason || errors.absentOther) ? ' required-error' : '')}>
              <div className="radio-stack">
                {ABSENT_REASONS.map((reason) => (
                  <label className="radio-item" key={reason}>
                    <input
                      type="radio"
                      name="report-absent-reason"
                      value={reason}
                      checked={absentReason === reason}
                      onChange={() => { setAbsentReason(reason); clearErr('absentReason'); }}
                    />
                    <span>
                      {reason === 'Other'
                        ? t('reportM.otherColon')
                        : reason === 'Late Notice'
                        ? t('reportM.absentLate')
                        : reason === 'No Notice'
                        ? t('reportM.absentNoNotice')
                        : t('reportM.absentPrefix', { reason })}
                    </span>
                  </label>
                ))}
              </div>
              {absent && absentReason === 'Other' && (
                <>
                  <input
                    type="text"
                    className={'form-control' + (errors.absentOther ? ' required-error' : '')}
                    placeholder={t('reportM.typeReason')}
                    style={{ marginTop: 8 }}
                    list="report-hist-absentOther"
                    value={absentOther}
                    onChange={(e) => { setAbsentOther(e.target.value); clearErr('absentOther'); }}
                  />
                  <DatalistOptions id="report-hist-absentOther" values={history.absentOther} />
                </>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-outline" onClick={saveDraft} disabled={savingDraft}>
            {savingDraft ? t('common.saving') : t('reportM.saveDraft')}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('reportM.submitting') : t('reportM.submitReport')}
          </button>
        </div>
      </Modal>
      <Modal
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); setDragActive(false); }}
        title={t('reportM.uploadImages')}
        maxWidth="560px"
      >
        <div className="modal-body">
          <div
            className={'image-upload-dropzone' + (dragActive ? ' dragover' : '')}
            tabIndex={0}
            role="button"
            aria-label={t('reportM.dropzoneAria')}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragEnter={onDropZoneDragOver}
            onDragOver={onDropZoneDragOver}
            onDragLeave={onDropZoneDragLeave}
            onDrop={onDropZoneDrop}
          >
            <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
            <div className="image-upload-title">{t('reportM.chooseOrDrop')}</div>
            <div className="image-upload-sub">
              {t('reportM.uploadMultiHint')}
            </div>
          </div>
          {uploadStatus && <div className="image-upload-status show">{uploadStatus}</div>}
          <div className="upload-preview image-upload-preview">
            {images.map((url, idx) => (
              <div className="upload-thumb-wrap" key={idx}>
                <img className="upload-thumb" src={url} alt={`Report image ${idx + 1}`} onClick={() => setLightbox(url)} />
                <button
                  type="button"
                  className="upload-thumb-remove"
                  aria-label="Remove image"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(idx);
                  }}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => { setUploadOpen(false); setDragActive(false); }}>
            {t('reportM.done')}
          </button>
        </div>
      </Modal>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

// Native <datalist> of past values for an input's autofill suggestions.
function DatalistOptions({ id, values }) {
  const opts = Array.isArray(values) ? values : [];
  if (!opts.length) return null;
  return (
    <datalist id={id}>
      {opts.map((v, i) => (
        <option key={i} value={v} />
      ))}
    </datalist>
  );
}
