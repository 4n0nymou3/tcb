class UnknownDcError extends Error {
  constructor(dc) {
    super(`no configured address for DC ${dc} - refusing to guess or fall back`);
    this.name = "UnknownDcError";
    this.dc = dc;
  }
}
class ConfigParseError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "ConfigParseError";
  }
}
function parseProxyMultiConf(text) {
  const clusters = new Map();
  let defaultDc = null;
  let timeout = null;
  const withoutComments = text.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  const statements = withoutComments.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    const parts = stmt.split(/\s+/);
    const keyword = parts[0];
    if (keyword === "default") {
      const dc = parseSignedDc(parts[1], stmt);
      defaultDc = dc;
    } else if (keyword === "timeout") {
      const ms = Number(parts[1]);
      if (!Number.isFinite(ms) || ms < 10 || ms > 3e4) throw new ConfigParseError(`invalid timeout: ${stmt}`);
      timeout = ms;
    } else if (keyword === "proxy_for") {
      const dc = parseSignedDc(parts[1], stmt);
      const addr = parts[2];
      assertHostPort(addr, stmt);
      pushAddr(clusters, dc, addr);
    } else if (keyword === "proxy") {
      const addr = parts[1];
      assertHostPort(addr, stmt);
      pushAddr(clusters, 0, addr);
    } else if (keyword === "min_connections" || keyword === "max_connections") {
      if (!Number.isFinite(Number(parts[1]))) throw new ConfigParseError(`invalid ${keyword}: ${stmt}`);
    } else {
      throw new ConfigParseError(`'proxy <ip>:<port>;' expected, got: ${stmt}`);
    }
  }
  return { defaultDc, timeout, clusters };
}
function parseSignedDc(token, stmt) {
  const n = Number(token);
  if (!Number.isInteger(n) || n < -32768 || n >= 32768) {
    throw new ConfigParseError(`invalid target id (integer -32768..32767 expected): ${stmt}`);
  }
  return n;
}
function assertHostPort(addr, stmt) {
  if (!addr || !/^\[?[^\s]+\]?:\d+$/.test(addr)) throw new ConfigParseError(`expected <ip>:<port>: ${stmt}`);
}
function pushAddr(clusters, dc, addr) {
  if (!clusters.has(dc)) clusters.set(dc, []);
  clusters.get(dc).push(addr);
}
const CORE_DC_ADDRESSES = Object.freeze({
  1: ["149.154.175.50:443"],
  2: ["149.154.167.51:443"],
  3: ["149.154.175.100:443"],
  4: ["149.154.167.91:443"],
  5: ["149.154.171.5:443"],
  203: ["91.105.192.100:443"]
});
const FAILURE_RETRY_MS = 60 * 1e3;
class DcConfigCache {
  constructor({
    url = "https://core.telegram.org/getProxyConfig",
    ttlMs = 60 * 60 * 1e3,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    seed = null,
    staticTable = CORE_DC_ADDRESSES
  } = {}) {
    this._url = url;
    this._ttlMs = ttlMs;
    this._fetch = fetchImpl;
    this._now = now;
    this._parsed = seed;
    this._fetchedAt = seed ? 0 : -Infinity;
    this._failedAt = -Infinity;
    this._inFlight = null;
    this._static = staticTable;
  }
  async _ensureFresh() {
    const age = this._now() - this._fetchedAt;
    if (this._parsed && age < this._ttlMs) return;
    if (this._now() - this._failedAt < FAILURE_RETRY_MS) return;
    if (this._inFlight) return this._inFlight;
    this._inFlight = (async () => {
      try {
        const res = await this._fetch(this._url);
        if (!res.ok) throw new Error(`getProxyConfig fetch failed: HTTP ${res.status}`);
        const text = await res.text();
        this._parsed = parseProxyMultiConf(text);
        this._fetchedAt = this._now();
        this._failedAt = -Infinity;
      } catch (err) {
        this._failedAt = this._now();
      }
    })();
    try {
      await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }
  async resolveAll(targetDc) {
    const dc = Math.abs(targetDc);
    const out = [];
    for (const addr of this._static[dc] || []) if (!out.includes(addr)) out.push(addr);
    for (const addr of this._parsed?.clusters.get(dc) || []) {
      if (addr.endsWith(":443") && !out.includes(addr)) out.push(addr);
    }
    if (out.length === 0) throw new UnknownDcError(targetDc);
    return out;
  }
  async resolve(targetDc) {
    return (await this.resolveAll(targetDc))[0];
  }
}
export {
  CORE_DC_ADDRESSES,
  ConfigParseError,
  DcConfigCache,
  UnknownDcError,
  parseProxyMultiConf
};