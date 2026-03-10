// Drift Sentinel — TradingView floating badge + mini panel
// Injected via Shadow DOM, reads ds_last_state from chrome.storage.local

(function () {
  "use strict";

  const STATE_COLORS = {
    STABLE: "#00D4AA",
    DRIFT_FORMING: "#F59E0B",
    COMPROMISED: "#EF4444",
    BREAKDOWN: "#7C3AED",
  };
  const STATE_LABELS = {
    STABLE: "STABLE",
    DRIFT_FORMING: "DRIFT FORMING",
    COMPROMISED: "COMPROMISED",
    BREAKDOWN: "BREAKDOWN",
  };
  const GRAY = "#6B7280";
  const DEFAULT_POS = { top: 12, right: 12 };
  const DRAG_THRESHOLD = 5;

  // ── Host element + Shadow DOM ──────────────────────────────
  // DRAG FIX: position:fixed lives on the HOST (real DOM element), not inside shadow.
  // TradingView's canvas layers intercept pointermove on shadow-internal fixed elements.
  // Dragging the host itself stays above TradingView's event capture entirely.
  const host = document.createElement("div");
  host.id = "drift-sentinel-host";
  Object.assign(host.style, {
    position:      "fixed",
    zIndex:        "2147483647",
    top:           "12px",
    right:         "12px",
    left:          "auto",
    bottom:        "auto",
    pointerEvents: "all",
    userSelect:    "none",
    cursor:        "grab",
  });
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  // ── Styles ─────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;900&display=swap');

    :host { all: initial; display: block; }

    .badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: #0D1117;
      border: 1.5px solid var(--sc, #6B7280);
      border-radius: 9999px;
      user-select: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1.5px;
      color: var(--sc, #6B7280);
      box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      transition: border-color 0.3s, color 0.3s;
      white-space: nowrap;
    }

    .dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--sc, #6B7280);
      box-shadow: 0 0 6px var(--sc, #6B7280);
      transition: background 0.3s, box-shadow 0.3s;
    }

    .panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 220px;
      background: #0D1117;
      border: 1px solid #1F2937;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      font-family: 'JetBrains Mono', monospace;
      color: #E2E8F0;
      display: none;
      cursor: default;
    }
    .panel.open { display: block; }

    /* Brand header */
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand-text { display: flex; flex-direction: column; line-height: 1; }
    .brand-drift {
      font-size: 9px; font-weight: 400; color: #4B5563;
      letter-spacing: 0.45em; margin-bottom: 3px;
    }
    .brand-divider { height: 1px; background: #1A1D23; margin-bottom: 4px; }
    .brand-sentinel {
      font-size: 14px; font-weight: 900; color: #00D4AA;
      letter-spacing: 0.06em;
      text-shadow: 0 0 12px rgba(0,212,170,0.45);
    }
    .brand-tagline {
      font-size: 7px; font-weight: 400; color: #00D4AA;
      letter-spacing: 0.38em; opacity: 0.38; margin-top: 4px;
    }

    .divider { height: 1px; background: #1F2937; margin: 8px 0; }

    /* BSS */
    .bss-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .bss-label { font-size: 10px; color: #4B5563; letter-spacing: 2px; }
    .bss-right { display: flex; align-items: center; gap: 6px; }
    .bss-score { font-size: 22px; font-weight: 700; }
    .tier-badge {
      font-size: 8px; font-weight: 700; letter-spacing: 1.5px;
      padding: 1px 5px; border-radius: 2px; border: 1px solid;
    }

    /* DSI */
    .dsi-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .dsi-label { font-size: 10px; color: #4B5563; letter-spacing: 2px; }
    .dsi-right { display: flex; align-items: center; gap: 6px; }
    .dsi-score { font-size: 16px; font-weight: 700; }
    .state-chip {
      font-size: 8px; letter-spacing: 1px;
      padding: 2px 5px; border-radius: 3px;
    }

    /* Metrics */
    .metrics { display: flex; gap: 6px; margin-top: 4px; }
    .metric-cell {
      flex: 1; text-align: center; background: #080A0E;
      border-radius: 4px; padding: 6px 4px;
    }
    .metric-val { font-size: 16px; font-weight: 700; }
    .metric-lbl { font-size: 8px; color: #4B5563; letter-spacing: 1px; margin-top: 2px; }

    /* Dashboard button */
    .btn-dash {
      display: block; width: 100%; padding: 8px 0; margin-top: 4px;
      border-radius: 6px; border: 1px solid rgba(0,212,170,0.25);
      background: rgba(0,212,170,0.08); color: #00D4AA;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
      cursor: pointer; text-align: center;
    }
    .btn-dash:hover { background: rgba(0,212,170,0.15); }
  `;

  // ── Eye SVG (28x28, static) ────────────────────────────────
  const EYE_SVG = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="flex-shrink:0">
    <path d="M2.2,14 C7.6,7.8 20.4,7.8 25.8,14 C20.4,20.2 7.6,20.2 2.2,14Z"
          fill="none" stroke="#00D4AA" stroke-width="0.7"/>
    <circle cx="14" cy="14" r="4" fill="none"
            stroke="#00D4AA" stroke-width="0.5" opacity="0.5"/>
    <circle cx="14" cy="14" r="2.4" fill="none"
            stroke="#00D4AA" stroke-width="0.6"/>
    <circle cx="14" cy="14" r="1" fill="#00D4AA"/>
    <line x1="-0.5" y1="14" x2="2.2" y2="14"
          stroke="#00D4AA" stroke-width="0.8"/>
    <line x1="25.8" y1="14" x2="28.5" y2="14"
          stroke="#00D4AA" stroke-width="0.8"/>
  </svg>`;

  // ── Badge ──────────────────────────────────────────────────
  const badge = document.createElement("div");
  badge.className = "badge";
  badge.innerHTML = `<span class="dot"></span><span class="label">DS</span>`;

  // ── Panel ──────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="brand">
      ${EYE_SVG}
      <div class="brand-text">
        <span class="brand-drift">DRIFT</span>
        <div class="brand-divider"></div>
        <span class="brand-sentinel">SENTINEL</span>
        <span class="brand-tagline">ALWAYS WATCHING</span>
      </div>
    </div>
    <div class="divider"></div>
    <div class="bss-row">
      <span class="bss-label">BSS</span>
      <div class="bss-right">
        <span class="bss-score" id="p-bss">--</span>
        <span class="tier-badge" id="p-tier">--</span>
      </div>
    </div>
    <div class="dsi-row">
      <span class="dsi-label">SESSION DSI</span>
      <div class="dsi-right">
        <span class="dsi-score" id="p-dsi">--</span>
        <span class="state-chip" id="p-state">--</span>
      </div>
    </div>
    <div class="metrics">
      <div class="metric-cell">
        <div class="metric-val" id="p-trades" style="color:#E2E8F0">--</div>
        <div class="metric-lbl">TRADES TODAY</div>
      </div>
      <div class="metric-cell">
        <div class="metric-val" id="p-viol">--</div>
        <div class="metric-lbl">VIOLATIONS</div>
      </div>
    </div>
    <div class="divider"></div>
    <button class="btn-dash" id="p-dash">OPEN DASHBOARD</button>
  `;

  shadow.appendChild(style);
  shadow.appendChild(badge);
  shadow.appendChild(panel);

  // ── Helpers ────────────────────────────────────────────────
  const $ = (id) => shadow.getElementById(id);

  function getStateColor(state) {
    return STATE_COLORS[state] || GRAY;
  }

  function getStateLabel(state) {
    return STATE_LABELS[state] || "NO DATA";
  }

  // ── Render ─────────────────────────────────────────────────
  // FIELD PATHS — all read from flat /v1/state response shape:
  //   bss_score                    (not data.bss.score)
  //   bss_tier                     (not data.bss.tier)
  //   dsi_score                    (not data.drift.score)
  //   metrics.trades_today_utc     (not data.trades_today)
  //   metrics.violations_today_utc (not data.drift.violations_today)
  //   drift.state                  ✅ unchanged
  function render(data) {
    const drift = data?.drift || {};
    const metrics = data?.metrics || {};
    const state = (drift.state || "").toUpperCase();
    const color = getStateColor(state);
    const label = getStateLabel(state);

    // Badge
    badge.style.setProperty("--sc", color);
    badge.querySelector(".label").textContent = data ? label : "DS";

    // BSS — reads bss_score (number) and bss_tier (string) from top-level
    const bssScore = data?.bss_score ?? "--";
    const bssColor = typeof bssScore === "number"
      ? (bssScore >= 90 ? "#00D4AA" : bssScore >= 70 ? "#F59E0B" : "#EF4444")
      : GRAY;
    const bssTier = (data?.bss_tier || "UNRANKED").toUpperCase();

    const $bss = $("p-bss");
    $bss.textContent = bssScore;
    $bss.style.color = bssColor;

    const $tier = $("p-tier");
    $tier.textContent = bssTier;
    $tier.style.color = bssColor;
    $tier.style.borderColor = bssColor;

    // DSI — reads dsi_score from top-level (not drift.score)
    // DSI = 100 on a fresh session is CORRECT — no daily_scores row exists yet.
    // It is NOT a fallback or error. It decrements as violations accumulate intraday.
    // DSI resets each session. BSS (longitudinal) and DSI (intraday) are different clocks.
    const dsiScore = data?.dsi_score ?? "--";
    const dsiColor = typeof dsiScore === "number"
      ? (dsiScore >= 85 ? "#00D4AA" : dsiScore >= 65 ? "#F59E0B" : "#EF4444")
      : GRAY;

    const $dsi = $("p-dsi");
    $dsi.textContent = dsiScore;
    $dsi.style.color = dsiColor;

    const $state = $("p-state");
    $state.textContent = label;
    $state.style.color = color;
    $state.style.background = color + "15";

    // Metrics — reads from metrics sub-object with _utc suffix
    const trades = metrics?.trades_today_utc ?? 0;
    $("p-trades").textContent = trades;

    const violations = metrics?.violations_today_utc ?? 0;
    const $viol = $("p-viol");
    $viol.textContent = violations;
    $viol.style.color = violations > 0 ? "#EF4444" : "#00D4AA";
  }

  // ── Position persistence ───────────────────────────────────
  function applyPosition(pos) {
    host.style.top    = (pos.top  ?? 12) + "px";
    host.style.left   = pos.left != null ? pos.left + "px" : "auto";
    host.style.right  = pos.left != null ? "auto" : (pos.right ?? 12) + "px";
    host.style.bottom = "auto";
  }

  function savePosition() {
    const pos = {
      top:  Math.round(parseFloat(host.style.top)  || 12),
      left: host.style.left !== "auto" ? Math.round(parseFloat(host.style.left)) : null,
      right: host.style.right !== "auto" ? Math.round(parseFloat(host.style.right)) : 12,
    };
    chrome.storage.local.set({ ds_badge_position: pos });
  }

  chrome.storage.local.get("ds_badge_position", (res) => {
    applyPosition(res.ds_badge_position || DEFAULT_POS);
  });

  // ── Drag + Click logic (on HOST — avoids TradingView canvas capture) ────────
  let didDrag = false;
  let startX, startY, startLeft, startTop;

  host.addEventListener("pointerdown", (e) => {
    // Don't drag when clicking panel contents or dashboard button.
    // Must use composedPath() — e.target is retargeted to the host across the shadow boundary.
    const path = e.composedPath();
    if (path.some((el) => el.classList && el.classList.contains("panel"))) return;
    e.preventDefault();
    host.setPointerCapture(e.pointerId);
    didDrag = false;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseFloat(host.style.left) || (window.innerWidth - host.offsetWidth - (parseFloat(host.style.right) || 12));
    startTop  = parseFloat(host.style.top)  || 12;
    host.style.cursor = "grabbing";
  });

  host.addEventListener("pointermove", (e) => {
    if (!host.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!didDrag && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

    didDrag = true;

    const newLeft = Math.max(0, Math.min(window.innerWidth  - host.offsetWidth,  startLeft + dx));
    const newTop  = Math.max(0, Math.min(window.innerHeight - host.offsetHeight, startTop  + dy));

    host.style.left   = newLeft + "px";
    host.style.right  = "auto";
    host.style.top    = newTop  + "px";
  });

  host.addEventListener("pointerup", (e) => {
    host.releasePointerCapture(e.pointerId);
    host.style.cursor = "grab";

    if (didDrag) {
      savePosition();
      return;
    }

    // Single click → toggle panel (only if click was on badge, not panel).
    // Must use composedPath() — e.target is retargeted to the host across the shadow boundary.
    const path = e.composedPath();
    const clickedPanel = path.some((el) => el.classList && el.classList.contains("panel"));
    if (!clickedPanel) {
      togglePanel();
    }
  });

  // Double click on badge → reset to default position
  badge.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    applyPosition(DEFAULT_POS);
    chrome.storage.local.set({ ds_badge_position: DEFAULT_POS });
  });

  // ── Panel toggle ───────────────────────────────────────────
  let outsideClickHandler = null;

  function togglePanel() {
    if (panel.classList.contains("open")) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    panel.classList.add("open");
    outsideClickHandler = (e) => {
      const path = e.composedPath();
      if (!path.includes(host)) closePanel();
    };
    setTimeout(() => document.addEventListener("mousedown", outsideClickHandler), 0);
  }

  function closePanel() {
    panel.classList.remove("open");
    if (outsideClickHandler) {
      document.removeEventListener("mousedown", outsideClickHandler);
      outsideClickHandler = null;
    }
  }

  // ── Dashboard button ───────────────────────────────────────
  $("p-dash").addEventListener("click", (e) => {
    e.stopPropagation();
    window.open("https://app.driftsentinel.io", "_blank");
  });

  // ── Data: initial load + live updates ──────────────────────
  // Reads from ds_last_state — flat /v1/state response stored by background.js
  chrome.storage.local.get("ds_last_state", (res) => {
    render(res.ds_last_state || null);
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.ds_last_state) {
      render(changes.ds_last_state.newValue || null);
    }
  });

  console.log("[DriftSentinel] content script loaded on", window.location.hostname);
})();
