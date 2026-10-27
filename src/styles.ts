const LIGHT = `
  --surface: rgba(255, 255, 255, 0.94);
  --surface-solid: #ffffff;
  --border: rgba(15, 23, 42, 0.08);
  --text: #0f172a;
  --muted: #64748b;
  --accent: #4f46e5;
  --on-accent: #ffffff;
  --warn: #b45309;
  --danger: #cf222e;
  --hover: rgba(15, 23, 42, 0.05);
  --code: rgba(15, 23, 42, 0.06);
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 12px 32px -14px rgba(15, 23, 42, 0.3);
`

const DARK = `
  --surface: rgba(22, 27, 34, 0.92);
  --surface-solid: #161b22;
  --border: rgba(255, 255, 255, 0.08);
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #8b93ff;
  --on-accent: #0d1117;
  --warn: #e3b341;
  --danger: #f85149;
  --hover: rgba(255, 255, 255, 0.06);
  --code: rgba(255, 255, 255, 0.08);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px -14px rgba(0, 0, 0, 0.7);
`

/** A tick drawn around the centre of its 16×16 box: x 4.75–11.25 and y 5.5–10.5 both centre on 8. */
const TICK_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.75 8.25 7 10.5l4.25-5' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`

/** The card's contents keep a readable line length however wide the card gets. */
const TEXT_WIDTH = '734px'

/** The overlay lives in a shadow root, so these are its only styles; the theme follows GitHub's appearance setting. */
export const OVERLAY_STYLES = `
:host {
  all: initial;
  ${LIGHT}
  position: fixed; top: 10px; left: 50%; z-index: 2147483000;
  transform: translateX(-50%);
  width: min(900px, calc(100vw - 32px));
  --line-width: 2px;
  color: var(--text);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
:host-context(html[data-color-mode="dark"]) { ${DARK} }
@media (prefers-color-scheme: dark) {
  :host-context(html[data-color-mode="auto"]) { ${DARK} }
}
:host([data-dock="bottom"]) { top: auto; bottom: 10px; }
:host([data-hidden]) { width: max-content; max-width: calc(100vw - 32px); }

* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
/* These icons are drawn for a tour at the top; at the bottom they turn upside down. */
:host([data-dock="bottom"]) .turns-with-dock svg { transform: rotate(180deg); }

.card {
  position: relative;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 20px);
  padding: 22px max(16px, calc((100% - ${TEXT_WIDTH}) / 2)) 12px;
  background: var(--surface);
  -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--border); border-radius: 12px;
  box-shadow: var(--shadow);
}
.card.tour { height: min(240px, calc(100vh - 20px)); }
:host([data-hidden]) .card { display: none; }

.eyebrow {
  flex: none; color: var(--accent);
  font-size: 10px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
}
.counter { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.icon {
  display: grid; place-items: center; width: 24px; height: 24px; padding: 0;
  background: transparent; border: 0; border-radius: 6px; color: var(--muted); cursor: pointer;
}
.icon:hover { background: var(--hover); color: var(--text); }
.icon[data-tour-override] { color: var(--accent); }

.rail {
  flex: none; margin: 0 -4px 14px; overflow-x: auto; overflow-y: hidden;
  scrollbar-width: none; overscroll-behavior-x: contain;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade-start, 0px), #000 calc(100% - var(--fade-end, 0px)), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--fade-start, 0px), #000 calc(100% - var(--fade-end, 0px)), transparent);
}
.rail::-webkit-scrollbar { display: none; }
.rail-content {
  position: relative; height: 24px;
  min-width: calc(var(--count) * 22px);
  --inset: calc(100% / var(--count) / 2);
}
.track {
  position: absolute; top: 11px; left: var(--inset); right: var(--inset);
  height: var(--line-width); border-radius: 1px; background: var(--accent);
}
.dots { position: relative; display: flex; height: 100%; }
.dot {
  flex: 1 1 0; min-width: 0; height: 100%; padding: 0;
  display: grid; place-items: center;
  background: none; border: 0; cursor: pointer;
}
/* The dot and its tick share one grid cell and one size, so the tick is centred by construction. */
.dot::before, .dot::after {
  content: ""; grid-area: 1 / 1; width: 10px; height: 10px; border-radius: 50%;
  transition: width 0.2s ease, height 0.2s ease, opacity 0.15s ease, transform 0.15s ease;
}
.dot::before { background: var(--accent); }
.dot::after {
  background: var(--on-accent); opacity: 0;
  -webkit-mask: ${TICK_MASK} center / 100% no-repeat; mask: ${TICK_MASK} center / 100% no-repeat;
}
.dot[data-done]::after { opacity: 1; }
.dot[aria-current="step"]::before, .dot[aria-current="step"]::after { width: 16px; height: 16px; }
.dot:hover::before, .dot:hover::after { transform: scale(1.15); }
.dot:focus-visible { outline: none; }
.dot:focus-visible::before { outline: 2px solid var(--accent); outline-offset: 2px; }
.tip {
  position: absolute; z-index: 1; max-width: 260px; padding: 3px 7px; overflow: hidden;
  background: var(--text); color: var(--surface-solid); border-radius: 5px;
  font-size: 11px; text-overflow: ellipsis; white-space: nowrap;
  opacity: 0; pointer-events: none; transform: translateX(-50%);
  transition: opacity 0.12s ease;
}
.tip[data-shown] { opacity: 1; }

.step {
  flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--fade-end, 0px)), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - var(--fade-end, 0px)), transparent);
}
.step-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em; }
.step-title[hidden] { display: none; }
.location {
  align-self: flex-start; padding: 0;
  background: none; border: 0; color: var(--accent); cursor: pointer; text-align: left;
  font: 600 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all;
}
.location .folder { color: var(--muted); font-weight: 400; }
.location:hover { text-decoration: underline; }
.location:hover .folder { color: var(--accent); }
.location[hidden] { display: none; }
.warning { margin: 4px 0 0; color: var(--warn); font-size: 12px; }
.warning:empty { display: none; }

.notes { margin-top: 8px; line-height: 1.5; }
.notes.loading { color: var(--muted); }
.notes.plain { white-space: pre-wrap; }
.notes > :first-child { margin-top: 0; }
.notes > :last-child { margin-bottom: 0; }
.notes p, .notes ul, .notes ol, .notes pre { margin: 0 0 6px; }
.notes ul, .notes ol { padding-left: 18px; }
.notes li { margin: 1px 0; }
.notes li.task-list-item { list-style: none; margin-left: -18px; }
.notes input[type="checkbox"] { margin: 0 6px 0 0; vertical-align: -1px; }
.notes a { color: var(--accent); }
.notes strong { font-weight: 600; }
.notes code {
  padding: 1px 4px; background: var(--code); border-radius: 4px;
  font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.notes pre { padding: 6px 8px; overflow: auto; background: var(--code); border-radius: 6px; }
.notes pre code { padding: 0; background: none; }

.footer { flex: none; display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.controls { display: flex; gap: 2px; margin-left: -4px; }
.status { min-width: 0; overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.status:not(:empty)::before { content: "·"; margin-right: 6px; }
.spacer { flex: 1; }
.button {
  display: inline-flex; align-items: center; gap: 3px; height: 28px; padding: 0 10px;
  background: transparent; border: 1px solid var(--border); border-radius: 8px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  transition: background-color 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
}
.button:hover { background: var(--hover); }
.button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); padding: 0 8px 0 12px; }
.button.back { padding: 0 12px 0 8px; }
.button[hidden] { display: none; }
.button[aria-pressed="true"] { color: var(--accent); }
.button.primary:hover { filter: brightness(1.08); }
.button:disabled { opacity: 0.4; cursor: default; filter: none; }
.button:disabled:hover { background: transparent; }
.button.primary:disabled:hover { background: var(--accent); }

.hint { margin: 2px 0 10px; color: var(--muted); }
.tour-field {
  display: block; width: 100%; height: 168px; min-height: 72px; resize: vertical;
  padding: 8px 10px; background: var(--code); border: 0; border-radius: 8px; color: var(--text);
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tour-field::placeholder { color: var(--muted); }
.tour-field:focus { outline: 2px solid var(--accent); outline-offset: 0; }
.load .message { margin: 6px 0 0; color: var(--danger); font-size: 12px; }
.load .message:empty { display: none; }
.load .footer { flex-wrap: wrap; }
.load .main-buttons { display: flex; gap: 6px; margin-left: auto; }
.load .button { padding: 0 12px; white-space: nowrap; }
.load.onboarding { overflow: auto; padding-top: 20px; padding-bottom: 18px; }
.load-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.load-heading .eyebrow { display: block; margin-bottom: 5px; }
.load-heading .step-title { font-size: 18px; }
.load-heading .icon { flex: none; }
.tour-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 6px 0 12px; }
.tour-choice { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: transparent; text-align: left; cursor: pointer; }
.tour-choice strong, .tour-choice span { display: block; }
.tour-choice span { margin-top: 4px; color: var(--muted); font-size: 12px; }
.tour-choice[aria-pressed="true"] { border-color: var(--accent); background: var(--code); }
.token-setup { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.token-setup .skill-link { margin: 0 0 10px; }
.token-setup .hint, .method-hint { font-size: 12px; }
.token-setup .hint:last-child { margin-bottom: 0; }
.onboarding [hidden] { display: none; }
.generate-steps { margin: 8px 0 0; padding-left: 24px; }
.generate-step { padding-left: 6px; margin-bottom: 16px; }
.generate-step::marker { color: var(--accent); font-weight: 600; }
.generate-step:last-child { margin-bottom: 0; }
.generate-content { min-width: 0; }
.generate-title { margin: 0; font-size: 13px; font-weight: 600; }
.generate-content .hint { margin: 3px 0 8px; font-size: 12px; }
.copy-row { display: flex; align-items: flex-start; gap: 8px; }
.copy-text {
  display: block; flex: 1; width: 0; min-width: 0; resize: none; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--code); color: var(--text);
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere;
}
.copy-text:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.copy-button { min-width: 64px; justify-content: center; }
.copy-feedback { min-height: 18px; margin: 8px 0; color: var(--muted); font-size: 12px; }
.generate-next { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.generate-next .hint { margin: 0; font-size: 12px; }
.skill-link { display: inline-block; align-self: flex-start; margin-top: 12px; color: var(--accent); font-size: 12px; }
.manual-tour { flex: none; margin: 4px 0 0; padding-top: 12px; border-top: 1px solid var(--border); }
.manual-tour .hint { font-size: 12px; margin-top: 5px; }
.manual-tour .tour-field { height: 96px; }

.pill {
  display: none; align-items: center; gap: 6px; height: 28px; padding: 0 8px 0 12px;
  background: var(--surface);
  -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--border); border-radius: 999px;
  box-shadow: var(--shadow); cursor: pointer;
}
.pill .counter { margin: 0; }
.pill.loading { cursor: default; }
.pill.loading .counter { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.4; } }
.pill svg { color: var(--muted); }
.pill.problem { height: auto; min-height: 28px; padding: 2px 2px 2px 12px; border-radius: 14px; cursor: default; }
.pill.problem .message { color: var(--danger); font-size: 12px; line-height: 1.35; text-wrap: balance; }
.pill.problem .icon { flex: none; align-self: flex-start; }
:host([data-hidden]) .pill { display: inline-flex; }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`
