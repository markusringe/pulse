/**
 * Nachrichtenbus für horizontales Skalieren.
 * Ohne REDIS_URL: In-Prozess (EventEmitter) — nur ein Node-Prozess.
 * Mit REDIS_URL: PUBLISH/SUBSCRIBE über natives RESP, ohne npm-Paket.
 * Fanout gilt für alle Live-Events (vote/poll, deck, qa, quiz inkl. Antworten,
 * reactions, emergency). Eigene Instanz-ID verhindert Echo-Loops.
 */

const net = require("net");
const { EventEmitter } = require("events");
const crypto = require("crypto");

const INSTANCE_ID = crypto.randomBytes(8).toString("hex");
const CHANNEL_PREFIX = "pulse:room:";

function createBus() {
  const local = new EventEmitter();
  local.setMaxListeners(0);
  const redisUrl = process.env.REDIS_URL;
  let redis = null;

  if (redisUrl) {
    redis = connectRedis(redisUrl, (channel, payload) => {
      const code = channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : channel;
      let msg;
      try {
        msg = JSON.parse(payload);
      } catch {
        return;
      }
      if (msg.instanceId === INSTANCE_ID) return;
      local.emit("remote", code, msg.envelope);
    });
  }

  return {
    instanceId: INSTANCE_ID,
    redisEnabled: Boolean(redis),
    publish(code, envelope) {
      if (!redis) return;
      redis.publish(CHANNEL_PREFIX + code, JSON.stringify({ instanceId: INSTANCE_ID, envelope }));
    },
    subscribeRooms() {
      /* Pattern-Subscribe einmalig in connectRedis */
    },
    onRemote(fn) {
      local.on("remote", fn);
    },
    async ping() {
      if (!redis) return { ok: true, mode: "in-process" };
      return redis.ping();
    },
  };
}

function connectRedis(url, onMessage) {
  const parsed = new URL(url);
  const host = parsed.hostname || "127.0.0.1";
  const port = Number(parsed.port) || 6379;
  const password = decodeURIComponent(parsed.password || "");
  let pub = null;
  let sub = null;
  let pubBuf = Buffer.alloc(0);
  let subBuf = Buffer.alloc(0);
  let ready = false;

  function attach(socket, kind) {
    socket.setNoDelay(true);
    socket.on("error", (err) => console.warn(`[redis ${kind}]`, err.message));
    socket.on("close", () => {
      ready = false;
      setTimeout(() => connect(kind), 1500);
    });
  }

  function connect(kind) {
    const socket = net.connect({ host, port }, () => {
      if (password) socket.write(resp(["AUTH", password]));
      if (kind === "sub") {
        socket.write(resp(["PSUBSCRIBE", CHANNEL_PREFIX + "*"]));
        ready = true;
      } else {
        ready = true;
      }
    });
    attach(socket, kind);
    if (kind === "sub") {
      sub = socket;
      socket.on("data", (chunk) => {
        subBuf = Buffer.concat([subBuf, chunk]);
        const parsedMsg = parseRespStream(subBuf);
        subBuf = parsedMsg.rest;
        for (const item of parsedMsg.values) handleSub(item, onMessage);
      });
    } else {
      pub = socket;
      socket.on("data", (chunk) => {
        pubBuf = Buffer.concat([pubBuf, chunk]);
        const parsedMsg = parseRespStream(pubBuf);
        pubBuf = parsedMsg.rest;
      });
    }
  }

  connect("pub");
  connect("sub");

  return {
    publish(channel, payload) {
      if (!pub || pub.destroyed) return;
      pub.write(resp(["PUBLISH", channel, payload]));
    },
    ping() {
      return { ok: ready, mode: "redis" };
    },
  };
}

function resp(parts) {
  let out = `*${parts.length}\r\n`;
  for (const p of parts) {
    const s = Buffer.from(String(p));
    out += `$${s.length}\r\n${s.toString("latin1")}\r\n`;
  }
  return out;
}

/**
 * Minimaler RESP-Parser für Pub/Sub-Arrays (pmessage).
 */
function parseRespStream(buf) {
  const values = [];
  let offset = 0;
  while (offset < buf.length) {
    const next = parseOne(buf, offset);
    if (!next) break;
    values.push(next.value);
    offset = next.offset;
  }
  return { values, rest: buf.subarray(offset) };
}

function parseOne(buf, offset) {
  if (offset >= buf.length) return null;
  const type = String.fromCharCode(buf[offset]);
  const nl = buf.indexOf("\r\n", offset);
  if (nl < 0) return null;
  if (type === "+" || type === "-" || type === ":") {
    return { value: buf.toString("utf8", offset + 1, nl), offset: nl + 2 };
  }
  if (type === "$") {
    const len = Number(buf.toString("utf8", offset + 1, nl));
    if (len < 0) return { value: null, offset: nl + 2 };
    const start = nl + 2;
    const end = start + len;
    if (buf.length < end + 2) return null;
    return { value: buf.toString("utf8", start, end), offset: end + 2 };
  }
  if (type === "*") {
    const count = Number(buf.toString("utf8", offset + 1, nl));
    let pos = nl + 2;
    const arr = [];
    for (let i = 0; i < count; i++) {
      const item = parseOne(buf, pos);
      if (!item) return null;
      arr.push(item.value);
      pos = item.offset;
    }
    return { value: arr, offset: pos };
  }
  return { value: null, offset: nl + 2 };
}

function handleSub(item, onMessage) {
  if (!Array.isArray(item)) return;
  // ['pmessage', pattern, channel, payload] oder ['message', channel, payload]
  if (item[0] === "pmessage" && item.length >= 4) onMessage(item[2], item[3]);
  if (item[0] === "message" && item.length >= 3) onMessage(item[1], item[2]);
}

module.exports = { createBus, INSTANCE_ID };
