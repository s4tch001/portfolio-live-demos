import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch, queryPath } from '../lib/apiClient.js';
import { monthRange, normalizeReport } from '../lib/format.js';
import { onRealtime } from '../lib/realtime.js';

// Shared in-memory cache for the schedule/report domain (legacy global `DB` +
// the ensure*ForRange month loaders). Schedule, Reports, and Lesson Tracker all
// read from here. Month-keyed caching avoids redundant D1 reads.
const DataCtx = createContext(null);

function mergeById(existing, incoming) {
  const map = new Map(existing.map((it) => [String(it.id), it]));
  incoming.forEach((it) => map.set(String(it.id), it));
  return [...map.values()];
}

function normalizeDraft(d) {
  return { ...d, images: Array.isArray(d.images) ? d.images : JSON.parse(d.images || '[]') };
}

export function DataProvider({ children }) {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportDrafts, setReportDrafts] = useState([]);

  const teachersLoaded = useRef(false);
  const studentsLoaded = useRef(false);
  const loadedMonths = useRef(new Set());
  const pending = useRef(new Map());

  const ensureTeachers = useCallback(async () => {
    if (teachersLoaded.current) return;
    teachersLoaded.current = true;
    try {
      const list = await apiFetch('/teachers');
      if (Array.isArray(list)) setTeachers(list);
    } catch (e) {
      teachersLoaded.current = false;
    }
  }, []);

  const ensureStudents = useCallback(async () => {
    if (studentsLoaded.current) return;
    studentsLoaded.current = true;
    try {
      const list = await apiFetch(queryPath('/students', { limit: 500 }));
      if (Array.isArray(list)) setStudents(list);
    } catch (e) {
      studentsLoaded.current = false;
    }
  }, []);

  // Load schedules + reports for a month (cached; force re-reads + replaces).
  const ensureMonth = useCallback(async (year, month, force = false) => {
    const { start, end, key } = monthRange(year, month);
    if (!force && loadedMonths.current.has(key)) return;
    if (pending.current.has(key)) {
      await pending.current.get(key).catch(() => {});
      return;
    }
    const p = (async () => {
      const [sched, reps, drafts] = await Promise.all([
        apiFetch(queryPath('/schedules', { start, end })).catch(() => null),
        apiFetch(queryPath('/reports', { start, end })).catch(() => null),
        apiFetch(queryPath('/report-drafts', { start, end })).catch(() => null),
      ]);
      if (Array.isArray(drafts)) {
        setReportDrafts((prev) => mergeById(prev, drafts.map(normalizeDraft)));
      }
      const inMonth = (dateStr) => dateStr >= start && dateStr <= end;
      if (Array.isArray(sched)) {
        setSchedules((prev) =>
          mergeById(force ? prev.filter((s) => !inMonth(s.date)) : prev, sched),
        );
      }
      if (Array.isArray(reps)) {
        const norm = reps.map(normalizeReport);
        // reports don't carry a date; reconcile by schedule_id within the fetched set on force
        setReports((prev) => {
          if (force) {
            const freshIds = new Set(norm.map((r) => String(r.id)));
            return mergeById(prev.filter((r) => !freshIds.has(String(r.id))), norm);
          }
          return mergeById(prev, norm);
        });
      }
      loadedMonths.current.add(key);
    })();
    pending.current.set(key, p);
    try {
      await p;
    } finally {
      pending.current.delete(key);
    }
  }, []);

  const reloadMonth = useCallback(
    (year, month) => ensureMonth(year, month, true),
    [ensureMonth],
  );

  // Force-reload only the months we ALREADY have loaded that cover the given dates
  // (a viewer is looking at them). Months nobody loaded are skipped → no reads.
  const reloadLoadedForDates = useCallback(
    (dates) => {
      const done = new Set();
      (dates || []).forEach((d) => {
        const [y, m] = String(d).split('-').map(Number);
        if (!y || !m) return;
        const key = monthRange(y, m - 1).key;
        if (done.has(key)) return;
        done.add(key);
        if (loadedMonths.current.has(key)) ensureMonth(y, m - 1, true);
      });
    },
    [ensureMonth],
  );

  const reloadAllLoaded = useCallback(() => {
    for (const key of [...loadedMonths.current]) {
      const [y, m] = String(key.split(':')[0]).split('-').map(Number);
      if (y && m) ensureMonth(y, m - 1, true);
    }
  }, [ensureMonth]);

  // ---- schedule mutators (keep cache in sync after API writes) ----
  const upsertSchedule = useCallback((sched) => {
    setSchedules((prev) => {
      const idx = prev.findIndex((s) => s.id == sched.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...sched };
        return next;
      }
      return [...prev, sched];
    });
  }, []);

  const removeSchedule = useCallback((id) => {
    setSchedules((prev) => prev.filter((s) => s.id != id));
  }, []);

  // ---- teacher + student write-through mutators (keep the shared cache fresh
  // after Accounts/Students mutate, with ZERO extra reads — the API response
  // already carries the row). If the cache wasn't loaded yet these are no-ops
  // on an empty list, and the next ensureTeachers/ensureStudents fetches fresh.
  const upsertTeacher = useCallback((t) => {
    setTeachers((prev) => {
      const idx = prev.findIndex((x) => x.id == t.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...t };
        return next;
      }
      return [...prev, t];
    });
  }, []);

  const removeTeacher = useCallback((id) => {
    setTeachers((prev) => prev.filter((x) => x.id != id));
  }, []);

  const upsertStudent = useCallback((s) => {
    setStudents((prev) => {
      const idx = prev.findIndex((x) => x.id == s.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...s };
        return next;
      }
      return [...prev, s];
    });
  }, []);

  const removeStudent = useCallback((id) => {
    setStudents((prev) => prev.filter((x) => x.id != id));
  }, []);

  // ---- report + draft mutators (keyed by schedule_id: one per schedule) ----
  const upsertReport = useCallback((report) => {
    setReports((prev) => {
      const idx = prev.findIndex((r) => r.schedule_id == report.schedule_id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...report };
        return next;
      }
      return [...prev, report];
    });
  }, []);

  const upsertDraft = useCallback((draft) => {
    setReportDrafts((prev) => {
      const idx = prev.findIndex((d) => d.schedule_id == draft.schedule_id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...draft };
        return next;
      }
      return [...prev, draft];
    });
  }, []);

  const removeDraft = useCallback((scheduleId) => {
    setReportDrafts((prev) => prev.filter((d) => d.schedule_id != scheduleId));
  }, []);

  const getDraftForSchedule = useCallback(
    (scheduleId) => reportDrafts.find((d) => d.schedule_id == scheduleId) || null,
    [reportDrafts],
  );

  const getReportForSchedule = useCallback(
    (scheduleId) => reports.find((r) => r.schedule_id == scheduleId) || null,
    [reports],
  );

  // Exact-name student resolver (legacy resolveStudentId): the /students search
  // also matches notes, so never blindly take data[0].
  const resolveStudentId = useCallback(async (name) => {
    const q = (name || '').trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    try {
      const data = await apiFetch(
        queryPath('/students', { search: q, limit: 20 }),
      );
      if (Array.isArray(data)) {
        const exact = data.find((s) => (s.name || '').trim().toLowerCase() === lower);
        if (exact) return exact.id;
      }
    } catch (e) {}
    return null;
  }, []);

  // ── Live cross-user sync ────────────────────────────────────────────────
  // Apply pushes from other users to the shared cache. Row-carrying events patch
  // in place (ZERO extra reads); 'reload' events refetch only already-loaded
  // months. transactions/admins/permissions are handled by their own views.
  useEffect(() => {
    const offSync = onRealtime('sync', (msg) => {
      if (!msg) return;
      const { resource, action, id, row, scope } = msg;
      if (resource === 'schedules') {
        if (action === 'upsert' && row) upsertSchedule(row);
        else if (action === 'remove' && id != null) removeSchedule(id);
        else if (action === 'reload') {
          if (scope && scope.all) reloadAllLoaded();
          else if (scope && Array.isArray(scope.dates)) reloadLoadedForDates(scope.dates);
          else if (scope && scope.date) reloadLoadedForDates([scope.date]);
        }
      } else if (resource === 'reports') {
        if (action === 'upsert' && row) upsertReport(normalizeReport(row));
      } else if (resource === 'students') {
        if (action === 'upsert' && row) upsertStudent(row);
        else if (action === 'remove' && id != null) removeStudent(id);
      } else if (resource === 'teachers') {
        if (action === 'upsert' && row) upsertTeacher(row);
        else if (action === 'remove' && id != null) removeTeacher(id);
      }
    });
    // On reconnect, re-validate everything we have loaded to recover missed changes.
    const offReconnect = onRealtime('reconnect', () => {
      reloadAllLoaded();
      if (teachersLoaded.current) {
        apiFetch('/teachers').then((l) => Array.isArray(l) && setTeachers(l)).catch(() => {});
      }
      if (studentsLoaded.current) {
        apiFetch(queryPath('/students', { limit: 500 })).then((l) => Array.isArray(l) && setStudents(l)).catch(() => {});
      }
    });
    return () => {
      offSync();
      offReconnect();
    };
  }, [
    upsertSchedule, removeSchedule, upsertReport, upsertStudent, removeStudent,
    upsertTeacher, removeTeacher, reloadAllLoaded, reloadLoadedForDates,
  ]);

  const value = {
    teachers,
    students,
    schedules,
    reports,
    reportDrafts,
    ensureTeachers,
    ensureStudents,
    ensureMonth,
    reloadMonth,
    upsertSchedule,
    removeSchedule,
    upsertTeacher,
    removeTeacher,
    upsertStudent,
    removeStudent,
    upsertReport,
    upsertDraft,
    removeDraft,
    getDraftForSchedule,
    getReportForSchedule,
    resolveStudentId,
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
