import { t } from './i18n.js';

function b64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function tryB64Decode(str) {
  try {
    const result = b64UrlDecode(str);
    if (result.includes('\uFFFD')) return null;
    return result;
  } catch (e) {
    return null;
  }
}

function splitFragment(url) {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) return { base: url, remark: '' };
  return { base: url.slice(0, hashIdx), remark: decodeURIComponent(url.slice(hashIdx + 1)) };
}

function parsePort(raw) {
  if (!/^[0-9]+$/.test(raw)) throw new Error(t('err.chainPortInvalid'));
  const value = Number(raw);
  if (value < 1 || value > 65535) throw new Error(t('err.chainPortInvalid'));
  return value;
}

function splitHostPort(hostPort) {
  if (hostPort.startsWith('[')) {
    const closeIdx = hostPort.indexOf(']');
    if (closeIdx === -1) throw new Error(t('err.ipv6Invalid'));
    const address = hostPort.slice(1, closeIdx);
    const afterBracket = hostPort.slice(closeIdx + 1);
    if (afterBracket !== '' && afterBracket[0] !== ':') throw new Error(t('err.ipv6Invalid'));
    return { address, port: afterBracket.slice(1) };
  }
  const idx = hostPort.lastIndexOf(':');
  if (idx === -1) return { address: hostPort, port: '' };
  return { address: hostPort.slice(0, idx), port: hostPort.slice(idx + 1) };
}

const SUPPORTED_NETWORKS = ['tcp', 'ws', 'grpc'];
const SUPPORTED_SECURITY = ['none', 'tls', 'reality'];

function validateNetworkSecurity(pc) {
  if (!SUPPORTED_NETWORKS.includes(pc.network)) {
    throw new Error(t('err.networkUnsupported', { network: pc.network }));
  }
  if (!SUPPORTED_SECURITY.includes(pc.security)) {
    throw new Error(t('err.securityUnsupported', { security: pc.security }));
  }
  if (pc.security === 'reality' && !pc.pbk) {
    throw new Error(t('err.realityPbkRequired'));
  }
}

function parseVless(input) {
  const { base, remark } = splitFragment(input);
  const withoutScheme = base.slice('vless://'.length);
  const atIdx = withoutScheme.lastIndexOf('@');
  if (atIdx === -1) throw new Error(t('err.vlessInvalidUuidAddr'));
  const uuid = withoutScheme.slice(0, atIdx);
  const rest = withoutScheme.slice(atIdx + 1);
  const qIdx = rest.indexOf('?');
  const hostPort = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { address, port } = splitHostPort(hostPort);
  const params = new URLSearchParams(queryStr);

  if (!uuid) throw new Error(t('err.vlessInvalidUuid'));
  if (!address || !port) throw new Error(t('err.vlessInvalidAddrPort'));

  const pc = {
    protocol: 'vless',
    uuid: uuid,
    address: address,
    port: parsePort(port),
    network: (params.get('type') || 'tcp').toLowerCase(),
    security: (params.get('security') || 'none').toLowerCase(),
    sni: params.get('sni') || params.get('host') || address,
    host: params.get('host') || params.get('sni') || address,
    path: params.get('path') || '/',
    fp: params.get('fp') || 'chrome',
    alpn: params.get('alpn') ? params.get('alpn').split(',') : undefined,
    flow: params.get('flow') || '',
    serviceName: params.get('serviceName') || '',
    pbk: params.get('pbk') || '',
    sid: params.get('sid') || '',
    encryption: params.get('encryption') || 'none',
    remark: remark || 'Chain'
  };
  validateNetworkSecurity(pc);
  return pc;
}

function parseTrojan(input) {
  const { base, remark } = splitFragment(input);
  const withoutScheme = base.slice('trojan://'.length);
  const atIdx = withoutScheme.lastIndexOf('@');
  if (atIdx === -1) throw new Error(t('err.trojanInvalidPwdAddr'));
  const password = decodeURIComponent(withoutScheme.slice(0, atIdx));
  const rest = withoutScheme.slice(atIdx + 1);
  const qIdx = rest.indexOf('?');
  const hostPort = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { address, port } = splitHostPort(hostPort);
  const params = new URLSearchParams(queryStr);

  if (!password) throw new Error(t('err.trojanInvalidPwd'));
  if (!address || !port) throw new Error(t('err.trojanInvalidAddrPort'));

  const pc = {
    protocol: 'trojan',
    password: password,
    address: address,
    port: parsePort(port),
    network: (params.get('type') || 'tcp').toLowerCase(),
    security: (params.get('security') || 'tls').toLowerCase(),
    sni: params.get('sni') || params.get('host') || address,
    host: params.get('host') || params.get('sni') || address,
    path: params.get('path') || '/',
    fp: params.get('fp') || 'chrome',
    alpn: params.get('alpn') ? params.get('alpn').split(',') : undefined,
    serviceName: params.get('serviceName') || '',
    pbk: params.get('pbk') || '',
    sid: params.get('sid') || '',
    remark: remark || 'Chain'
  };
  validateNetworkSecurity(pc);
  return pc;
}

function parseShadowsocks(input) {
  const { base, remark } = splitFragment(input);
  const withoutScheme = base.slice('ss://'.length);
  const atIdx = withoutScheme.lastIndexOf('@');

  if (atIdx !== -1) {
    const userInfoRaw = withoutScheme.slice(0, atIdx);
    const rest = withoutScheme.slice(atIdx + 1);
    const qIdx = rest.indexOf('?');
    const hostPort = qIdx === -1 ? rest : rest.slice(0, qIdx);
    const { address, port } = splitHostPort(hostPort);
    let decoded = tryB64Decode(userInfoRaw);
    if (!decoded) decoded = decodeURIComponent(userInfoRaw);
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1 || !address || !port) {
      throw new Error(t('err.ssInvalid'));
    }
    return {
      protocol: 'shadowsocks',
      method: decoded.slice(0, colonIdx),
      password: decoded.slice(colonIdx + 1),
      address: address,
      port: parsePort(port),
      network: 'tcp',
      security: 'none',
      remark: remark || 'Chain'
    };
  }

  const qIdx = withoutScheme.indexOf('?');
  const mainPart = qIdx === -1 ? withoutScheme : withoutScheme.slice(0, qIdx);
  const decoded = tryB64Decode(mainPart);
  if (!decoded) throw new Error(t('err.ssInvalid'));
  const atIdx2 = decoded.lastIndexOf('@');
  if (atIdx2 === -1) throw new Error(t('err.ssInvalid'));
  const methodPass = decoded.slice(0, atIdx2);
  const hostPort = decoded.slice(atIdx2 + 1);
  const colonIdx = methodPass.indexOf(':');
  const { address, port } = splitHostPort(hostPort);
  if (colonIdx === -1 || !address || !port) {
    throw new Error(t('err.ssInvalid'));
  }
  return {
    protocol: 'shadowsocks',
    method: methodPass.slice(0, colonIdx),
    password: methodPass.slice(colonIdx + 1),
    address: address,
    port: parsePort(port),
    network: 'tcp',
    security: 'none',
    remark: remark || 'Chain'
  };
}

function parseSocksHttp(input, protocol) {
  const { base, remark } = splitFragment(input);
  const schemeLen = input.indexOf('://') + 3;
  const withoutScheme = base.slice(schemeLen);
  const atIdx = withoutScheme.lastIndexOf('@');

  let user = '', pass = '', hostPort;
  if (atIdx !== -1) {
    const userInfoRaw = withoutScheme.slice(0, atIdx);
    hostPort = withoutScheme.slice(atIdx + 1);
    let decoded = tryB64Decode(userInfoRaw);
    if (decoded && decoded.includes(':')) {
      const idx = decoded.indexOf(':');
      user = decoded.slice(0, idx);
      pass = decoded.slice(idx + 1);
    } else {
      const plain = decodeURIComponent(userInfoRaw);
      const idx = plain.indexOf(':');
      if (idx !== -1) {
        user = plain.slice(0, idx);
        pass = plain.slice(idx + 1);
      }
    }
  } else {
    hostPort = withoutScheme;
  }

  const qIdx = hostPort.indexOf('?');
  if (qIdx !== -1) hostPort = hostPort.slice(0, qIdx);
  const { address, port } = splitHostPort(hostPort);
  if (!address || !port) throw new Error(t('err.socksHttpInvalid', { proto: protocol === 'socks' ? 'SOCKS' : 'HTTP' }));
  if (!user || !pass) throw new Error(t('err.socksHttpMissingAuth', { proto: protocol === 'socks' ? 'SOCKS' : 'HTTP' }));

  return {
    protocol: protocol,
    user: user,
    pass: pass,
    address: address,
    port: parsePort(port),
    network: 'tcp',
    security: input.toLowerCase().startsWith('https://') ? 'tls' : 'none',
    sni: address,
    fp: 'chrome',
    remark: remark || 'Chain'
  };
}

export function parseChainConfig(raw) {
  const input = (raw || '').trim();
  if (!input) return null;

  const schemeMatch = input.match(/^([a-zA-Z0-9+.-]+):\/\//);
  if (!schemeMatch) throw new Error(t('err.chainLinkInvalid'));
  const scheme = schemeMatch[1].toLowerCase();

  let parsed;
  try {
    if (scheme === 'vless') parsed = parseVless(input);
    else if (scheme === 'trojan') parsed = parseTrojan(input);
    else if (scheme === 'ss') parsed = parseShadowsocks(input);
    else if (scheme === 'socks' || scheme === 'socks5') parsed = parseSocksHttp(input, 'socks');
    else if (scheme === 'http' || scheme === 'https') parsed = parseSocksHttp(input, 'http');
    else throw new Error(t('err.chainUnsupported'));
  } catch (e) {
    if (e instanceof URIError) throw new Error(t('err.chainLinkInvalid'));
    throw e;
  }
  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) throw new Error(t('err.chainPortInvalid'));
  return parsed;
}