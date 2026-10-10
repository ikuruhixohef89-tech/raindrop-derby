// Keyboard, mouse and touch. The game reads { steer: -1..1, cling: bool } once per simulation step.
const STEER_PX = 70; // drag distance for full steering

export function createInput(surface) {
  const keys = new Set();
  const state = { steer: 0, cling: false };
  const listeners = [];
  let dragId = null;
  let dragStart = 0;
  let dragSteer = 0;
  const hold = { left: false, right: false, cling: false };

  const STEER_L = new Set(['arrowleft', 'a']);
  const STEER_R = new Set(['arrowright', 'd']);
  const CLING = new Set([' ', 'shift', 'arrowdown', 's']);

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (STEER_L.has(k) || STEER_R.has(k) || CLING.has(k)) e.preventDefault();
    if (!e.repeat) for (const fn of listeners) fn(k, e);
    keys.add(k);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear();
    dragId = null;
    dragSteer = 0;
    hold.left = hold.right = hold.cling = false;
  });

  surface.addEventListener('pointerdown', e => {
    if (e.target.closest('button, .screen-card, .touch')) return;
    if (dragId !== null) return;
    dragId = e.pointerId;
    dragStart = e.clientX;
    dragSteer = 0;
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is optional
    }
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId !== dragId) return;
    dragSteer = Math.max(-1, Math.min(1, (e.clientX - dragStart) / STEER_PX));
  });
  const endDrag = e => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    dragSteer = 0;
  };
  surface.addEventListener('pointerup', endDrag);
  surface.addEventListener('pointercancel', endDrag);

  // On-screen buttons (touch devices): any element with data-hold="left|right|cling".
  function bindButtons(root) {
    root.querySelectorAll('[data-hold]').forEach(btn => {
      const what = btn.dataset.hold;
      const on = e => {
        e.preventDefault();
        hold[what] = true;
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // optional
        }
      };
      const off = () => {
        hold[what] = false;
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
    });
  }

  return {
    onKey(fn) {
      listeners.push(fn);
    },
    bindButtons,
    read() {
      let s = 0;
      for (const k of keys) {
        if (STEER_L.has(k)) s -= 1;
        if (STEER_R.has(k)) s += 1;
      }
      if (hold.left) s -= 1;
      if (hold.right) s += 1;
      if (dragId !== null) s += dragSteer;
      state.steer = Math.max(-1, Math.min(1, s));
      let c = hold.cling;
      for (const k of keys) if (CLING.has(k)) c = true;
      state.cling = c;
      return state;
    },
    reset() {
      keys.clear();
      dragId = null;
      dragSteer = 0;
    },
  };
}
