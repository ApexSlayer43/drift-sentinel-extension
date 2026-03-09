const STATES = {
  STABLE:        { color: "#00D4AA", label: "STABLE" },
  DRIFT_FORMING: { color: "#F59E0B", label: "DRIFT FORMING" },
  COMPROMISED:   { color: "#EF4444", label: "COMPROMISED" },
  BREAKDOWN:     { color: "#7C3AED", label: "BREAKDOWN" },
};
const TIERS = {
  VERIFIED: "#00D4AA",
  TESTED:   "#F59E0B",
  DRAFT:    "#6B7280",
  UNRANKED: "#374151",
};
const GRAY = "#6B7280";

const $loading      = document.getElementById("view-loading");
const $connected    = document.getElementById("view-connected");
const $disconnected = document.getElementById("view-disconnected");

function show(view) {
  $loading.style.display = "none";
  $connected.style.display = "none";
  $disconnected.style.display = "none";
  view.style.display = "block";
}

function setStateColor(color) {
  document.body.style.setProperty("--sc", color);
  document.body.style.borderColor = color + "30";
  document.body.style.boxShadow = "0 0 30px " + color + "15";
}

show($loading);

chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" }, (res) => {
  if (!res || !res.has_token) {
    setStateColor(GRAY);
    document.getElementById("status-dot").classList.add("offline");
    document.getElementById("status-label").textContent = "OFFLINE";
    show($disconnected);
    return;
  }

  if (!res.last_state) {
    show($connected);
    document.getElementById("bss-score").textContent = "...";
    document.getElementById("bss-tier").textContent = "WAITING";
    document.getElementById("bss-tier").style.color = GRAY;
    document.getElementById("bss-tier").style.borderColor = GRAY;
    document.getElementById("dsi-score").textContent = "...";
    document.getElementById("dsi-state").textContent = "WAITING";
    document.getElementById("dsi-state").style.color = GRAY;
    document.getElementById("dsi-state").style.background = GRAY + "15";
    document.getElementById("trades-value").textContent = "--";
    document.getElementById("violations-value").textContent = "--";
    document.getElementById("violations-value").style.color = GRAY;
    return;
  }

  renderConnected(res.last_state);
});

function renderConnected(data) {
  show($connected);

  const bss = data.bss || {};
  const drift = data.drift || {};

  // --- Drift state → colors ---
  const driftState = (drift.state || "STABLE").toUpperCase();
  const stateInfo = STATES[driftState] || { color: GRAY, label: "NO DATA" };
  setStateColor(stateInfo.color);

  // --- BSS ---
  const bssScore = bss.score ?? "--";
  const bssColor = typeof bssScore === "number"
    ? (bssScore >= 90 ? "#00D4AA" : bssScore >= 70 ? "#F59E0B" : "#EF4444")
    : GRAY;
  document.getElementById("bss-score").textContent = bssScore;
  document.getElementById("bss-score").style.color = bssColor;

  const bssTier = (bss.tier || "UNRANKED").toUpperCase();
  const tierColor = TIERS[bssTier] || GRAY;
  const $tier = document.getElementById("bss-tier");
  $tier.textContent = bssTier;
  $tier.style.color = tierColor;
  $tier.style.borderColor = tierColor;

  // --- DSI ---
  const dsiScore = drift.score ?? "--";
  document.getElementById("dsi-score").textContent = dsiScore;
  document.getElementById("dsi-score").style.color = stateInfo.color;

  const $state = document.getElementById("dsi-state");
  $state.textContent = stateInfo.label;
  $state.style.color = stateInfo.color;
  $state.style.background = stateInfo.color + "15";

  // --- Metrics ---
  const trades = data.trades_today ?? 0;
  document.getElementById("trades-value").textContent = trades;

  const violations = drift.violations_today ?? 0;
  const $viol = document.getElementById("violations-value");
  $viol.textContent = violations;
  $viol.style.color = violations > 0 ? "#EF4444" : "#00D4AA";

  // --- Onboarding ---
  const onboard = data.onboarding;
  if (onboard && onboard.collected < onboard.required) {
    const pct = Math.min(100, Math.round((onboard.collected / onboard.required) * 100));
    document.getElementById("onboarding-bar").style.display = "block";
    document.getElementById("onboard-count").textContent = onboard.collected + "/" + onboard.required;
    document.getElementById("onboard-fill").style.width = pct + "%";
  }
}

// --- Button handlers ---
document.getElementById("btn-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://app.driftsentinel.io" });
});

document.getElementById("btn-settings").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://app.driftsentinel.io/settings" });
});

document.getElementById("btn-connect").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://app.driftsentinel.io/settings" });
});
