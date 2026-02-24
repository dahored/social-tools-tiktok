const FONT_MAP = {
  basic: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  "resident-evil":
    "'Resident Evil', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  "god-of-war": "'God of War', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const state = {
  username: "default",
  count: 0,
  label: "Counter",
  countColor: "#a00000",
  labelColor: "#a00000",
  fontType: "basic",
  letterSpacing: 0,
  wordSpacing: 0,
  countFontSize: 96,
  labelFontSize: 40,
  countTextShadow: false,
  labelTextShadow: false,
};

const usernameInput = document.getElementById("username");
const countEl = document.getElementById("count");
const labelEl = document.getElementById("counterLabel");
const statusEl = document.getElementById("status");
const widgetUrlInput = document.getElementById("widgetUrlInput");
const copyWidgetUrlBtn = document.getElementById("copyWidgetUrlBtn");

const labelInput = document.getElementById("labelInput");
const countColorInput = document.getElementById("countColor");
const labelColorInput = document.getElementById("labelColor");
const fontSelect = document.getElementById("fontType");
const letterSpacingInput = document.getElementById("letterSpacing");
const wordSpacingInput = document.getElementById("wordSpacing");
const countFontSizeInput = document.getElementById("countFontSize");
const labelFontSizeInput = document.getElementById("labelFontSize");
const countShadowToggle = document.getElementById("countShadowToggle");
const labelShadowToggle = document.getElementById("labelShadowToggle");

const incLink = document.getElementById("increaseLink");
const decLink = document.getElementById("decreaseLink");
const resetLink = document.getElementById("resetLink");
const incApiUrlInput = document.getElementById("increaseApiUrlInput");
const decApiUrlInput = document.getElementById("decreaseApiUrlInput");
const resetApiUrlInput = document.getElementById("resetApiUrlInput");
const copyIncreaseBtn = document.getElementById("copyIncreaseUrlBtn");
const copyDecreaseBtn = document.getElementById("copyDecreaseUrlBtn");
const copyResetBtn = document.getElementById("copyResetUrlBtn");
const testIncreaseBtn = document.getElementById("testIncreaseBtn");
const testDecreaseBtn = document.getElementById("testDecreaseBtn");
const testResetBtn = document.getElementById("testResetBtn");
let stream = null;

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function isPreviewMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("preview") === "true";
}

function buildPreviewUrl() {
  const url = new URL("/widgets/counter/index.html", window.location.origin);
  url.searchParams.set("username", state.username);
  url.searchParams.set("preview", "true");
  return url.toString();
}

function buildActionUrl(actionName) {
  const url = new URL(`/widgets/counter/${actionName}.html`, window.location.origin);
  url.searchParams.set("username", state.username);
  return url.toString();
}

function buildApiActionUrl(actionName) {
  const url = new URL(`/api/counter/${actionName}`, window.location.origin);
  url.searchParams.set("username", state.username);
  return url.toString();
}

function hexToRgba(color, alpha) {
  const raw = String(color || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3,8}$/.test(raw)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  let r = 0;
  let g = 0;
  let b = 0;

  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function copyText(text) {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "true");
  temp.style.position = "fixed";
  temp.style.top = "-9999px";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  temp.setSelectionRange(0, temp.value.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(temp);

  if (!ok) {
    throw new Error("Copy failed");
  }
}

function normalizeUsername(raw) {
  const sanitized = String(raw || "default")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
  return sanitized || "default";
}

function applyState() {
  countEl.textContent = state.count;
  labelEl.textContent = state.label;
  countEl.style.color = state.countColor;
  labelEl.style.color = state.labelColor;
  countEl.style.letterSpacing = state.letterSpacing + "px";
  labelEl.style.letterSpacing = state.letterSpacing + "px";
  countEl.style.wordSpacing = state.wordSpacing + "px";
  labelEl.style.wordSpacing = state.wordSpacing + "px";
  countEl.style.fontSize = state.countFontSize + "px";
  labelEl.style.fontSize = state.labelFontSize + "px";
  countEl.style.textShadow = state.countTextShadow
    ? `0 0 18px ${hexToRgba(state.countColor, 0.65)}`
    : "none";
  labelEl.style.textShadow = state.labelTextShadow
    ? `0 0 14px ${hexToRgba(state.labelColor, 0.65)}`
    : "none";

  const family = FONT_MAP[state.fontType] || FONT_MAP.basic;
  countEl.style.fontFamily = family;
  labelEl.style.fontFamily = family;

  labelInput.value = state.label;
  countColorInput.value = state.countColor;
  labelColorInput.value = state.labelColor;
  fontSelect.value = state.fontType;
  letterSpacingInput.value = state.letterSpacing;
  wordSpacingInput.value = state.wordSpacing;
  countFontSizeInput.value = state.countFontSize;
  labelFontSizeInput.value = state.labelFontSize;
  countShadowToggle.checked = Boolean(state.countTextShadow);
  labelShadowToggle.checked = Boolean(state.labelTextShadow);

  const increasePageUrl = buildActionUrl("increase");
  const decreasePageUrl = buildActionUrl("decrease");
  const resetPageUrl = buildActionUrl("reset");
  const increaseApiUrl = buildApiActionUrl("increase");
  const decreaseApiUrl = buildApiActionUrl("decrease");
  const resetApiUrl = buildApiActionUrl("reset");

  incLink.href = increasePageUrl;
  decLink.href = decreasePageUrl;
  resetLink.href = resetPageUrl;

  if (incApiUrlInput) {
    incApiUrlInput.value = increaseApiUrl;
  }

  if (decApiUrlInput) {
    decApiUrlInput.value = decreaseApiUrl;
  }

  if (resetApiUrlInput) {
    resetApiUrlInput.value = resetApiUrl;
  }

  if (widgetUrlInput) {
    widgetUrlInput.value = buildPreviewUrl();
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    throw new Error("Request failed: " + res.status);
  }
  return res.json();
}

function applyResponse(data) {
  state.username = data.username;
  state.count = data.count;
  state.label = data.label;
  state.countColor = data.countColor;
  state.labelColor = data.labelColor;
  state.fontType = data.fontType;
  state.letterSpacing = Number(data.letterSpacing ?? 0);
  state.wordSpacing = Number(data.wordSpacing ?? 0);
  state.countFontSize = Number(data.countFontSize ?? 96);
  state.labelFontSize = Number(data.labelFontSize ?? 40);
  state.countTextShadow = Boolean(data.countTextShadow);
  state.labelTextShadow = Boolean(data.labelTextShadow);
  usernameInput.value = state.username;
  applyState();
}

async function loadCounter() {
  setStatus("Loading...");
  const data = await api(
    "/api/counter?username=" + encodeURIComponent(state.username)
  );
  applyResponse(data);
  setStatus("Loaded for @" + state.username);
}

async function changeCounter(action) {
  setStatus("Updating...");
  const data = await api(
    "/api/counter/" + action + "?username=" + encodeURIComponent(state.username),
    {
      method: "POST",
    }
  );
  applyResponse(data);
  setStatus("Saved for @" + state.username);
}

async function saveSettings() {
  setStatus("Saving...");
  const payload = {
    username: state.username,
    label: labelInput.value,
    countColor: countColorInput.value,
    labelColor: labelColorInput.value,
    fontType: fontSelect.value,
    letterSpacing: Number(letterSpacingInput.value),
    wordSpacing: Number(wordSpacingInput.value),
    countFontSize: Number(countFontSizeInput.value),
    labelFontSize: Number(labelFontSizeInput.value),
    countTextShadow: countShadowToggle.checked,
    labelTextShadow: labelShadowToggle.checked,
  };

  const data = await api("/api/counter/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  applyResponse(data);
  setStatus("Saved settings for @" + state.username);
}

function connectStream() {
  if (typeof EventSource === "undefined") {
    return;
  }

  if (stream) {
    stream.close();
  }

  const streamUrl =
    "/api/counter/stream?username=" + encodeURIComponent(state.username);
  stream = new EventSource(streamUrl);

  stream.onopen = () => {
    setStatus("Live for @" + state.username);
  };

  stream.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data || data.error) {
        return;
      }
      applyResponse(data);
    } catch (error) {
      // ignore malformed stream message
    }
  };

  stream.onerror = () => {
    setStatus("Reconnecting live stream...");
  };
}

document.getElementById("loadUserBtn").addEventListener("click", async () => {
  state.username = normalizeUsername(usernameInput.value);
  await loadCounter();
  connectStream();
});

document.getElementById("increaseBtn").addEventListener("click", async () => {
  await changeCounter("increase");
});

document.getElementById("decreaseBtn").addEventListener("click", async () => {
  await changeCounter("decrease");
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  await changeCounter("reset");
});

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  await saveSettings();
});

if (copyWidgetUrlBtn) {
  copyWidgetUrlBtn.addEventListener("click", async () => {
    try {
      await copyText(widgetUrlInput.value);
      setStatus("Copied widget URL");
    } catch (error) {
      setStatus("Copy failed");
    }
  });
}

if (copyIncreaseBtn) {
  copyIncreaseBtn.addEventListener("click", async () => {
    try {
      await copyText(incApiUrlInput.value);
      setStatus("Copied increase URL");
    } catch (error) {
      setStatus("Copy failed");
    }
  });
}

if (copyDecreaseBtn) {
  copyDecreaseBtn.addEventListener("click", async () => {
    try {
      await copyText(decApiUrlInput.value);
      setStatus("Copied decrease URL");
    } catch (error) {
      setStatus("Copy failed");
    }
  });
}

if (copyResetBtn) {
  copyResetBtn.addEventListener("click", async () => {
    try {
      await copyText(resetApiUrlInput.value);
      setStatus("Copied reset URL");
    } catch (error) {
      setStatus("Copy failed");
    }
  });
}

if (testIncreaseBtn) {
  testIncreaseBtn.addEventListener("click", async () => {
    await changeCounter("increase");
  });
}

if (testDecreaseBtn) {
  testDecreaseBtn.addEventListener("click", async () => {
    await changeCounter("decrease");
  });
}

if (testResetBtn) {
  testResetBtn.addEventListener("click", async () => {
    await changeCounter("reset");
  });
}

window.addEventListener("beforeunload", () => {
  if (stream) {
    stream.close();
  }
});

(async function init() {
  const params = new URLSearchParams(window.location.search);
  state.username = normalizeUsername(params.get("username") || "default");

  if (isPreviewMode()) {
    document.body.classList.add("preview-mode");
  }

  await loadCounter();
  connectStream();
})();
