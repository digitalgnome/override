// Styles for the Quick Access panel (~300px wide). Everything is scoped
// under .cc-root so nothing leaks into Steam's own UI.

const css = `
.cc-root {
  --cc-accent: #1a9fff;
  --cc-accent-dim: rgba(26, 159, 255, 0.18);
  --cc-ok: #5ba32b;
  --cc-warn: #e8b931;
  --cc-muted: #8b929a;
  --cc-card: rgba(255, 255, 255, 0.04);
  --cc-line: rgba(255, 255, 255, 0.08);
}

/* ---------- tab bar ---------- */
.cc-root .cc-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin: 0 0 4px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
}
.cc-root .cc-tabs .cc-tab {
  flex: 1;
  min-width: 0 !important;
  height: 32px;
  padding: 0 6px !important;
  font-size: 13px;
  border-radius: 6px;
  background: transparent !important;
  color: var(--cc-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.cc-root .cc-tabs .cc-tab.cc-active {
  background: var(--cc-accent-dim) !important;
  color: #fff;
  font-weight: 600;
}
.cc-root .cc-tabs .cc-tab.cc-active { box-shadow: inset 0 -2px 0 var(--cc-accent); }
/* Steam turns focused button text dark (for its light focus background), so
   every custom button needs an explicit focused look. */
.cc-root .cc-tabs .cc-tab.gpfocus,
.cc-root .cc-tabs .cc-tab:hover {
  background: var(--cc-accent) !important;
  color: #fff !important;
  box-shadow: none;
}
.cc-root .cc-action-btn.cc-primary.gpfocus,
.cc-root .cc-action-btn.cc-primary:hover {
  background: #fff !important;
  color: #0e141b !important;
}

/* ---------- game hero ---------- */
.cc-root .cc-hero {
  position: relative;
  width: 100%;
  aspect-ratio: 460 / 215;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(135deg, #23384f, #12161c);
}
.cc-root .cc-hero img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
}
.cc-root .cc-hero::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(10, 14, 20, 0.92) 8%, rgba(10, 14, 20, 0) 65%);
}
.cc-root .cc-hero-text {
  position: absolute; left: 10px; right: 10px; bottom: 8px;
  z-index: 1;
  min-width: 0;
}
.cc-root .cc-hero-title {
  font-size: 16px; font-weight: 700; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}
.cc-root .cc-hero-meta { font-size: 11px; color: #c7d0d9; margin-top: 1px; }

/* ---------- badges ---------- */
.cc-root .cc-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 6px; border-radius: 4px;
}
.cc-root .cc-hero .cc-badge { position: absolute; top: 8px; left: 8px; z-index: 1; }
.cc-root .cc-badge-live { background: var(--cc-ok); color: #fff; }
.cc-root .cc-badge-idle { background: rgba(0,0,0,0.55); color: #c7d0d9; }
.cc-root .cc-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* ---------- value chip (Set Gil etc.) ---------- */
.cc-root .cc-value-btn {
  min-width: 0 !important;
  height: 30px;
  padding: 0 10px !important;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap;
}

/* ---------- store rows ---------- */
.cc-root .cc-store-row {
  display: flex; align-items: center; gap: 10px;
  min-width: 0; width: 100%;
}
.cc-root .cc-thumb {
  flex: 0 0 auto;
  width: 72px; height: 27px;          /* 184x69 capsule ratio */
  border-radius: 3px;
  object-fit: cover;
  background: linear-gradient(135deg, #23384f, #12161c);
}
.cc-root .cc-row-text { min-width: 0; flex: 1; }
.cc-root .cc-row-title {
  font-size: 13px; font-weight: 600; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cc-root .cc-row-sub {
  font-size: 11px; color: var(--cc-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cc-root .cc-row-sub .cc-ok { color: var(--cc-ok); }
.cc-root .cc-row-sub .cc-warn { color: var(--cc-warn); }
.cc-root .cc-action-btn {
  min-width: 0 !important;
  width: 64px;
  height: 28px;
  padding: 0 !important;
  font-size: 12px;
  display: flex; align-items: center; justify-content: center; gap: 4px;
}
.cc-root .cc-action-btn.cc-primary { background: var(--cc-accent) !important; color: #fff; }

/* ---------- toolbar (search, refresh, remove) ---------- */
.cc-root .cc-toolbar { display: flex; gap: 6px; width: 100%; }
.cc-root .cc-toolbar .cc-tool {
  flex: 1 1 0;
  min-width: 0 !important;
  height: 34px;
  padding: 0 10px !important;
  font-size: 13px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  white-space: nowrap;
}
.cc-root .cc-toolbar .cc-tool.cc-grow { flex: 3 1 0; }
.cc-root .cc-toolbar .cc-tool.cc-square { flex: 0 0 34px; padding: 0 !important; }
.cc-root .cc-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* ---------- cheat rows: [info] [control] on the right ---------- */
.cc-root .cc-controls { display: flex; align-items: center; gap: 6px; }
.cc-root .cc-icon-btn {
  min-width: 0 !important;
  width: 30px; height: 30px;
  padding: 0 !important;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  background: transparent !important;
  color: var(--cc-muted);
}
.cc-root .cc-icon-btn.gpfocus, .cc-root .cc-icon-btn:hover { color: #fff !important; background: var(--cc-accent) !important; }

/* ---------- misc ---------- */
.cc-root .cc-muted { font-size: 12px; color: var(--cc-muted); }
.cc-root .cc-empty {
  text-align: center; padding: 18px 8px 10px;
  color: var(--cc-muted); font-size: 13px; line-height: 1.4;
}
.cc-root .cc-empty svg { font-size: 28px; opacity: 0.6; margin-bottom: 8px; }
`;

export const Styles = () => <style>{css}</style>;
