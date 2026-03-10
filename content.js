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
  const DEFAULT_POS = { top: 12, left: null, right: 12 };
  const DRAG_THRESHOLD = 5;

  // ── Host element + Shadow DOM ──────────────────────────────
  const host = document.createElement("div");
  host.id = "drift-sentinel-host";
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  // ── Styles ─────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;900&display=swap');

    :host { all: initial; }

    .badge {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: #0D1117;
      border: 1.5px solid var(--sc, ${GRAY});
      border-radius: 9999px;
      cursor: grab;
      user-select: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1.5px;
      color: var(--sc, ${GRAY});
      box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      transition: border-color 0.3s, color 0.3s;
    }
    .badge.dragging { cursor: grabbing; }

    .dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--sc, ${GRAY});
      box-shadow: 0 0 6px var(--sc, ${GRAY});
      transition: background 0.3s, box-shadow 0.3s;
    }

    .panel {
      position: fixed;
      z-index: 2147483647;
      width: 220px;
      background: #0D1117;
      border: 1px solid #1F2937;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      font-family: 'JetBrains Mono', monospace;
      color: #E2E8F0;
      display: none;
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
  function render(data) {
    const drift = data?.drift || {};
    const bss = data?.bss || {};
    const state = (drift.state || "").toUpperCase();
    const color = getStateColor(state);
    const label = getStateLabel(state);

    // Badge
    badge.style.setProperty("--sc", color);
    badge.querySelector(".label").textContent = data ? label : "DS";

    // BSS
    const bssScore = bss.score ?? "--";
    const bssColor = typeof bssScore === "number"
      ? (bssScore >= 90 ? "#00D4AA" : bssScore >= 70 ? "#F59E0B" : "#EF4444")
      : GRAY;
    const bssTier = (bss.tier || "UNRANKED").toUpperCase();
    const tierColor = bssColor;

    const $bss = $("p-bss");
    $bss.textContent = bssScore;
    $bss.style.color = bssColor;

    const $tier = $("p-tier");
    $tier.textContent = bssTier;
    $tier.style.color = tierColor;
    $tier.style.borderColor = tierColor;

    // DSI
    const dsiScore = drift.score ?? data?.dsi_score ?? "--";
    const $dsi = $("p-dsi");
    $dsi.textContent = dsiScore;
    $dsi.style.color = color;

    const $state = $("p-state");
    $state.textContent = label;
    $state.style.color = color;
    $state.style.background = color + "15";

    // Metrics
    const trades = data?.trades_today ?? 0;
    $("p-trades").textContent = trades;

    const violations = drift.violations_today ?? 0;
    const $viol = $("p-viol");
    $viol.textContent = violations;
    $viol.style.color = violations > 0 ? "#EF4444" : "#00D4AA";
  }

  // ── Position persistence ───────────────────────────────────
  function applyPosition(pos) {
    badge.style.top = pos.top + "px";
    if (pos.left != null) {
      badge.style.left = pos.left + "px";
      badge.style.right = "auto";
    } else {
      badge.style.right = (pos.right || 12) + "px";
      badge.style.left = "auto";
    }
  }

  function savePosition() {
    const rect = badge.getBoundingClientRect();
    const pos = { top: Math.round(rect.top), left: Math.round(rect.left) };
    chrome.storage.local.set({ ds_badge_position: pos });
  }

  chrome.storage.local.get("ds_badge_position", (res) => {
    applyPosition(res.ds_badge_position || DEFAULT_POS);
  });

  // ── Drag + Click logic ─────────────────────────────────────
  let isDragging = false;
  let didDrag = false;
  let startX, startY, startLeft, startTop;

  badge.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    badge.setPointerCapture(e.pointerId);
    isDragging = false;
    didDrag = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = badge.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
  });

  badge.addEventListener("pointermove", (e) => {
    if (!badge.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!isDragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

    isDragging = true;
    didDrag = true;
    badge.classList.add("dragging");

    const newLeft = Math.max(0, Math.min(window.innerWidth - badge.offsetWidth, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - badge.offsetHeight, startTop + dy));

    badge.style.left = newLeft + "px";
    badge.style.right = "auto";
    badge.style.top = newTop + "px";
  });

  badge.addEventListener("pointerup", (e) => {
    badge.releasePointerCapture(e.pointerId);
    badge.classList.remove("dragging");

    if (didDrag) {
      savePosition();
      return;
    }

    // Single click → toggle panel
    togglePanel();
  });

  // Double click → reset position
  badge.addEventListener("dblclick", (e) => {
    e.preventDefault();
    applyPosition(DEFAULT_POS);
    chrome.storage.local.set({ ds_badge_position: DEFAULT_POS });
    if (panel.classList.contains("open")) positionPanel();
  });

  // ── Panel toggle + positioning ─────────────────────────────
  let outsideClickHandler = null;

  function togglePanel() {
    if (panel.classList.contains("open")) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    positionPanel();
    panel.classList.add("open");

    outsideClickHandler = (e) => {
      // Check if click is inside shadow DOM
      const path = e.composedPath();
      if (!path.includes(badge) && !path.includes(panel)) {
        closePanel();
      }
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

  function positionPanel() {
    const rect = badge.getBoundingClientRect();
    const midY = window.innerHeight / 2;
    const panelW = 220;

    // Horizontal: align right edge of panel with right edge of badge,
    // but clamp to viewport
    let left = rect.right - panelW;
    if (left < 4) left = 4;
    if (left + panelW > window.innerWidth - 4) left = window.innerWidth - panelW - 4;
    panel.style.left = left + "px";

    // Vertical: below badge if in top half, above if in bottom half
    if (rect.top < midY) {
      panel.style.top = (rect.bottom + 6) + "px";
      panel.style.bottom = "auto";
    } else {
      panel.style.bottom = (window.innerHeight - rect.top + 6) + "px";
      panel.style.top = "auto";
    }
  }

  // ── Dashboard button ───────────────────────────────────────
  $("p-dash").addEventListener("click", () => {
    window.open("https://app.driftsentinel.io", "_blank");
  });

  // ── Data: initial load + live updates ──────────────────────
  chrome.storage.local.get("ds_last_state", (res) => {
    render(res.ds_last_state || null);
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.ds_last_state) {
      render(changes.ds_last_state.newValue || null);
      // Reposition panel if open (badge text may change width)
      if (panel.classList.contains("open")) positionPanel();
    }
  });

  console.log("[DriftSentinel] content script loaded on", window.location.hostname);
})();
