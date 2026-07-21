// Tiny pub/sub bridge between the single WebSocket (owned by NotificationsProvider)
// and everything that wants live data updates (DataProvider, the Remaining/Receipts
// views, the Permissions/Accounts pages). Keeps those decoupled — no provider
// reordering — and lets multiple subscribers react to the same server push.
//
// Events:
//   'sync'      → payload = the server's { kind:'sync', resource, action, id, row, scope }
//   'reconnect' → (no payload) the socket re-opened; subscribers may re-validate
//                 anything they have loaded to recover changes missed while offline.
const channels = new Map(); // event -> Set<fn>

export function onRealtime(event, fn) {
  if (!channels.has(event)) channels.set(event, new Set());
  channels.get(event).add(fn);
  return () => {
    const set = channels.get(event);
    if (set) set.delete(fn);
  };
}

export function emitRealtime(event, payload) {
  const set = channels.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (e) {
      /* a bad subscriber must never break delivery to the others */
    }
  }
}
