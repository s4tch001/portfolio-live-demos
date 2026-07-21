// Single source of truth for which kebab (AccountActionsMenu) is open. Using one
// shared id guarantees only one menu is open at a time — no event-timing races.
let openId = null;
const subs = new Set();

export function getOpenId() {
  return openId;
}
export function setOpenId(id) {
  if (openId === id) return;
  openId = id;
  subs.forEach((fn) => fn(openId));
}
export function subscribeMenu(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
