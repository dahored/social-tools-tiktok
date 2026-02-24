const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 4050;
const DATA_FILE = path.join(__dirname, "data", "counter-state.json");
const sseClients = new Map();

const FONT_TYPES = new Set(["basic", "resident-evil", "god-of-war"]);
const DEFAULT_USER_STATE = {
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
  updatedAt: null,
};

function toNumberInRange(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
      return false;
    }
  }
  return fallback;
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.users ||
      typeof parsed.users !== "object"
    ) {
      return { users: {} };
    }
    return parsed;
  } catch {
    return { users: {} };
  }
}

async function writeStore(store) {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function sanitizeUsername(input) {
  const raw = String(input || "default").trim();
  const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return sanitized || "default";
}

function normalizeUserState(value) {
  const base = { ...DEFAULT_USER_STATE };
  if (!value || typeof value !== "object") {
    return { ...base, updatedAt: new Date().toISOString() };
  }

  const count = Number.isFinite(Number(value.count))
    ? Math.max(0, Math.trunc(Number(value.count)))
    : base.count;
  const label =
    typeof value.label === "string" && value.label.trim()
      ? value.label.trim().slice(0, 60)
      : base.label;
  const countColor =
    typeof value.countColor === "string" ? value.countColor : base.countColor;
  const labelColor =
    typeof value.labelColor === "string" ? value.labelColor : base.labelColor;
  const fontType = FONT_TYPES.has(value.fontType) ? value.fontType : base.fontType;
  const letterSpacing = toNumberInRange(
    value.letterSpacing,
    base.letterSpacing,
    -10,
    60
  );
  const wordSpacing = toNumberInRange(
    value.wordSpacing,
    base.wordSpacing,
    -20,
    120
  );
  const countFontSize = toNumberInRange(
    value.countFontSize,
    base.countFontSize,
    20,
    320
  );
  const labelFontSize = toNumberInRange(
    value.labelFontSize,
    base.labelFontSize,
    12,
    220
  );
  const countTextShadow = toBoolean(
    value.countTextShadow,
    base.countTextShadow
  );
  const labelTextShadow = toBoolean(
    value.labelTextShadow,
    base.labelTextShadow
  );

  return {
    count,
    label,
    countColor,
    labelColor,
    fontType,
    letterSpacing,
    wordSpacing,
    countFontSize,
    labelFontSize,
    countTextShadow,
    labelTextShadow,
    updatedAt: new Date().toISOString(),
  };
}

async function getUserState(username) {
  const store = await readStore();
  const current = normalizeUserState(store.users[username]);
  if (!store.users[username]) {
    store.users[username] = current;
    await writeStore(store);
  }
  return current;
}

async function updateUserState(username, updater) {
  const store = await readStore();
  const current = normalizeUserState(store.users[username]);
  const next = normalizeUserState(updater(current));
  store.users[username] = next;
  await writeStore(store);
  return next;
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function registerSseClient(username, res) {
  if (!sseClients.has(username)) {
    sseClients.set(username, new Set());
  }
  sseClients.get(username).add(res);
}

function unregisterSseClient(username, res) {
  const group = sseClients.get(username);
  if (!group) return;
  group.delete(res);
  if (group.size === 0) {
    sseClients.delete(username);
  }
}

function broadcastState(username, state) {
  const group = sseClients.get(username);
  if (!group) return;

  const payload = { username, ...state };
  for (const client of group) {
    sendSse(client, payload);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/widgets", express.static(path.join(__dirname, "widgets")));
app.use(express.static(path.join(__dirname, "web")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", port: PORT, time: new Date().toISOString() });
});

app.get("/api/counter", async (req, res) => {
  try {
    const username = sanitizeUsername(req.query.username);
    const state = await getUserState(username);
    res.json({ username, ...state });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/counter/stream", async (req, res) => {
  const username = sanitizeUsername(req.query.username);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  registerSseClient(username, res);

  try {
    const state = await getUserState(username);
    sendSse(res, { username, ...state });
  } catch (error) {
    sendSse(res, { error: error.message });
  }

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unregisterSseClient(username, res);
  });
});

async function handleCounterAction(req, res, type) {
  try {
    const username = sanitizeUsername(req.query.username || req.body.username);
    const state = await updateUserState(username, (current) => {
      if (type === "increase") return { ...current, count: current.count + 1 };
      if (type === "decrease") {
        return { ...current, count: Math.max(0, current.count - 1) };
      }
      if (type === "reset") return { ...current, count: 0 };
      return current;
    });
    broadcastState(username, state);
    res.json({ username, ...state });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.all("/api/counter/increase", (req, res) =>
  handleCounterAction(req, res, "increase")
);
app.all("/api/counter/decrease", (req, res) =>
  handleCounterAction(req, res, "decrease")
);
app.all("/api/counter/reset", (req, res) =>
  handleCounterAction(req, res, "reset")
);

app.post("/api/counter/settings", async (req, res) => {
  try {
    const username = sanitizeUsername(req.query.username || req.body.username);
    const state = await updateUserState(username, (current) => {
      const next = { ...current };

      if (typeof req.body.label === "string") {
        const value = req.body.label.trim();
        if (value) next.label = value.slice(0, 60);
      }

      if (typeof req.body.countColor === "string") {
        next.countColor = req.body.countColor;
      }

      if (typeof req.body.labelColor === "string") {
        next.labelColor = req.body.labelColor;
      }

      if (
        typeof req.body.fontType === "string" &&
        FONT_TYPES.has(req.body.fontType)
      ) {
        next.fontType = req.body.fontType;
      }

      if (req.body.letterSpacing !== undefined) {
        next.letterSpacing = toNumberInRange(
          req.body.letterSpacing,
          next.letterSpacing,
          -10,
          60
        );
      }

      if (req.body.wordSpacing !== undefined) {
        next.wordSpacing = toNumberInRange(
          req.body.wordSpacing,
          next.wordSpacing,
          -20,
          120
        );
      }

      if (req.body.countFontSize !== undefined) {
        next.countFontSize = toNumberInRange(
          req.body.countFontSize,
          next.countFontSize,
          20,
          320
        );
      }

      if (req.body.labelFontSize !== undefined) {
        next.labelFontSize = toNumberInRange(
          req.body.labelFontSize,
          next.labelFontSize,
          12,
          220
        );
      }

      if (req.body.countTextShadow !== undefined) {
        next.countTextShadow = toBoolean(
          req.body.countTextShadow,
          next.countTextShadow
        );
      }

      if (req.body.labelTextShadow !== undefined) {
        next.labelTextShadow = toBoolean(
          req.body.labelTextShadow,
          next.labelTextShadow
        );
      }

      return next;
    });

    broadcastState(username, state);
    res.json({ username, ...state });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Social Tools running on http://0.0.0.0:" + PORT);
});
