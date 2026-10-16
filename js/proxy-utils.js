export function randomizeCase(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += Math.random() < 0.5 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

const ROUTING_COUNTRY_CODES = ['ir', 'cn', 'ru'];
const BLOCK_RULE_CODES = ['ads', 'porn', 'malware', 'phishing', 'cryptominers'];
const SANCTION_RULE_CODES = ['openai', 'googleai', 'anthropic', 'xai', 'microsoft', 'oracle', 'docker', 'adobe', 'epicgames', 'intel', 'amd', 'nvidia', 'asus', 'hp', 'lenovo'];

export function resolveSelectedCountries(routingCountries) {
  const selected = ROUTING_COUNTRY_CODES.filter(c => routingCountries && routingCountries[c]);
  return selected.length ? selected : ['ir'];
}

export function resolveSelectedBlockRules(blockRules) {
  return BLOCK_RULE_CODES.filter(c => blockRules && blockRules[c]);
}

export function resolveSelectedSanctionRules(sanctionBypass) {
  return SANCTION_RULE_CODES.filter(c => sanctionBypass && sanctionBypass[c]);
}

function isPlainIPv4(value) {
  const m = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    if (Number(m[i]) > 255) return false;
  }
  if (m[5] !== undefined && Number(m[5]) > 32) return false;
  return true;
}

function isPlainIPv6(value) {
  const bracketed = value.match(/^\[([0-9A-Fa-f:]+)\](?:\/(\d{1,3}))?$/);
  const plain = value.match(/^([0-9A-Fa-f:]+)(?:\/(\d{1,3}))?$/);
  const m = bracketed || plain;
  if (!m) return null;
  const addr = m[1];
  const prefix = m[2];
  if (!addr.includes(':')) return null;
  const groups = addr.split(':');
  if (groups.length < 3 || groups.length > 8) return null;
  if ((addr.match(/::/g) || []).length > 1) return null;
  if (groups.some(g => g !== '' && !/^[0-9A-Fa-f]{1,4}$/.test(g))) return null;
  if (prefix !== undefined && Number(prefix) > 128) return null;
  return addr + (prefix !== undefined ? '/' + prefix : '');
}

function looksLikeIPv4Shape(value) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?$/.test(value);
}

function isPlainDomain(value) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(value);
}

export function parseCustomRuleList(raw) {
  const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
  const domains = [];
  const ips = [];
  const seenDomains = new Set();
  const seenIps = new Set();
  lines.forEach(line => {
    const ipv6 = isPlainIPv6(line);
    if (ipv6) {
      if (!seenIps.has(ipv6)) { seenIps.add(ipv6); ips.push(ipv6); }
      return;
    }
    if (isPlainIPv4(line)) {
      if (!seenIps.has(line)) { seenIps.add(line); ips.push(line); }
      return;
    }
    if (looksLikeIPv4Shape(line)) return;
    if (isPlainDomain(line)) {
      const normalized = line.toLowerCase();
      if (!seenDomains.has(normalized)) { seenDomains.add(normalized); domains.push(normalized); }
      return;
    }
  });
  return { domains, ips };
}

export function durationToSeconds(value, fallbackSeconds) {
  const match = typeof value === 'string' ? value.trim().match(/^([1-9][0-9]*)(m|s)$/) : null;
  if (!match) return fallbackSeconds;
  const amount = parseInt(match[1]);
  return match[2] === 'm' ? amount * 60 : amount;
}

export function resolveTcbLabel(jsonName, echEnable, fragEnable, customDomainUsed) {
  const base = jsonName || (echEnable ? '👽 Anonymous TCB (ECH) 🚀' : (fragEnable ? '👽 Anonymous TCB (Fragment) 🚀' : '👽 Anonymous TCB (Normal) 🚀'));
  return base + (customDomainUsed ? ' 🌐' : '');
}

const LAN_AUTH_MAX_BYTES = 255;

function lanAuthHasControlChars(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function lanAuthByteLength(value) {
  return new TextEncoder().encode(value).length;
}

export function validateLanAuth(lanAccess, lanUsername, lanPassword) {
  if (!lanAccess) return null;
  const user = typeof lanUsername === 'string' ? lanUsername : '';
  const pass = typeof lanPassword === 'string' ? lanPassword : '';
  if (user === '' && pass === '') return null;
  if (user === '' || pass === '') return 'toast.lanAuthIncomplete';
  if (user.includes(':')) return 'toast.lanAuthUserColon';
  if (lanAuthHasControlChars(user) || lanAuthHasControlChars(pass)) return 'toast.lanAuthControlChars';
  if (lanAuthByteLength(user) > LAN_AUTH_MAX_BYTES || lanAuthByteLength(pass) > LAN_AUTH_MAX_BYTES) return 'toast.lanAuthTooLong';
  return null;
}

export function resolveLanAuth(lanAccess, lanUsername, lanPassword) {
  const errorKey = validateLanAuth(lanAccess, lanUsername, lanPassword);
  if (errorKey) throw new Error(errorKey);
  if (!lanAccess || !lanUsername) return null;
  return { username: lanUsername, password: lanPassword };
}