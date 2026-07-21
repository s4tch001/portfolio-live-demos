import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient.js';
import { onRealtime } from '../lib/realtime.js';

const MaintenanceCtx = createContext(null);
const LS_KEY = 'maintenance_mode';

// Seed synchronously from the last known value so a repeat visit during
// maintenance shows the maintenance page with ZERO flash (before the GET returns).
function seed() {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch (e) {
    return false;
  }
}

// Tracks the site-wide maintenance flag. `ready` flips true once the authoritative
// status is known (the public GET resolves), so the app can hold first paint until
// then and never flash the target page before redirecting to maintenance.
export function MaintenanceProvider({ children }) {
  const [maintenance, setMaintenance] = useState(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const persist = (on) => {
      try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    };
    apiFetch('/dev/maintenance')
      .then((d) => {
        if (!alive) return;
        const on = !!(d && d.maintenance);
        setMaintenance(on);
        persist(on);
      })
      .catch(() => {}) // keep the seeded value if the check fails
      .finally(() => {
        if (alive) setReady(true);
      });
    const off = onRealtime('sync', (msg) => {
      if (msg && msg.resource === 'maintenance') {
        setMaintenance(!!msg.value);
        persist(!!msg.value);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return (
    <MaintenanceCtx.Provider value={{ maintenance, ready, setMaintenance }}>
      {children}
    </MaintenanceCtx.Provider>
  );
}

export function useMaintenance() {
  const ctx = useContext(MaintenanceCtx);
  if (!ctx) throw new Error('useMaintenance must be used within MaintenanceProvider');
  return ctx;
}
