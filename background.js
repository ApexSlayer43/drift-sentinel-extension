const API_BASE = "https://api.driftsentinel.io/v1";

const BADGE_COLORS = {
  STABLE: "#00D4AA",
  DRIFT_FORMING: "#F59E0B",
  COMPROMISED: "#EF4444",
  BREAKDOWN: "#7C3AED",
};
const GRAY = "#6B7280";

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "DS" });
  chrome.action.setBadgeBackgroundColor({ color: GRAY });
  chrome.alarms.create("poll_state", { periodInMinutes: 0.5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll_state") pollState();
});

async function pollState() {
  try {
    const { ds_device_token } = await chrome.storage.local.get("ds_device_token");
    if (!ds_device_token) {
      chrome.action.setBadgeBackgroundColor({ color: GRAY });
      return;
    }

    const res = await fetch(`${API_BASE}/state`, {
      headers: { Authorization: `Bearer ${ds_device_token}` },
    });

    if (res.status === 401 || res.status === 403) {
      await chrome.storage.local.remove(["ds_device_token", "ds_account_ref", "ds_last_state"]);
      chrome.action.setBadgeBackgroundColor({ color: GRAY });
      chrome.action.setBadgeText({ text: "DS" });
      return;
    }

    if (!res.ok) {
      chrome.action.setBadgeBackgroundColor({ color: GRAY });
      return;
    }

    const data = await res.json();
    const state = data.drift?.state;
    const color = BADGE_COLORS[state] || GRAY;

    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text: "" });
    await chrome.storage.local.set({ ds_last_state: data });
  } catch {
    chrome.action.setBadgeBackgroundColor({ color: GRAY });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "REGISTER_DEVICE") {
    handleRegister(msg).then(sendResponse);
    return true;
  }

  if (msg.type === "GET_AUTH_STATE") {
    handleGetAuthState().then(sendResponse);
    return true;
  }

  if (msg.type === "DISCONNECT") {
    handleDisconnect().then(sendResponse);
    return true;
  }
});

async function handleRegister({ supabase_jwt, account_ref }) {
  try {
    const device_id = "ext-" + [...crypto.getRandomValues(new Uint8Array(8))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const res = await fetch(`${API_BASE}/device/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabase_jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_id, account_ref }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
    }

    const data = await res.json();
    await chrome.storage.local.set({
      ds_device_token: data.device_token,
      ds_account_ref: account_ref,
    });

    pollState();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function handleGetAuthState() {
  const { ds_device_token, ds_account_ref, ds_last_state } =
    await chrome.storage.local.get(["ds_device_token", "ds_account_ref", "ds_last_state"]);
  return {
    has_token: !!ds_device_token,
    account_ref: ds_account_ref || null,
    last_state: ds_last_state || null,
  };
}

async function handleDisconnect() {
  await chrome.storage.local.remove(["ds_device_token", "ds_account_ref", "ds_last_state"]);
  chrome.action.setBadgeBackgroundColor({ color: GRAY });
  chrome.action.setBadgeText({ text: "DS" });
  return { ok: true };
}
