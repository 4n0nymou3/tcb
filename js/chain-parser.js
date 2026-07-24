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

function splitHostPort(hostPort) {
  if (hostPort.startsWith('[')) {
    const closeIdx = hostPort.indexOf(']');
    if (closeIdx === -1) throw new Error('آدرس IPv6 در لینک Chain Proxy معتبر نیست.');
    const address = hostPort.slice(1, closeIdx);
    const portPart = hostPort.slice(closeIdx + 2);
    return { address, port: portPart };
  }
  const idx = hostPort.lastIndexOf(':');
  if (idx === -1) return { address: hostPort, port: '' };
  return { address: hostPort.slice(0, idx), port: hostPort.slice(idx + 1) };
}

const SUPPORTED_NETWORKS = ['tcp', 'ws', 'grpc'];
const SUPPORTED_SECURITY = ['none', 'tls', 'reality'];

function validateNetworkSecurity(pc) {
  if (!SUPPORTED_NETWORKS.includes(pc.network)) {
    throw new Error('نوع شبکه («' + pc.network + '») در لینک Chain Proxy پشتیبانی نمی‌شود. انواع پشتیبانی‌شده: tcp, ws, grpc');
  }
  if (!SUPPORTED_SECURITY.includes(pc.security)) {
    throw new Error('نوع امنیت («' + pc.security + '») در لینک Chain Proxy پشتیبانی نمی‌شود. انواع پشتیبانی‌شده: none, tls, reality');
  }
  if (pc.security === 'reality' && !pc.pbk) {
    throw new Error('لینک Chain Proxy با Reality نیاز به Public Key (pbk) دارد.');
  }
}

function parseVless(input) {
  const { base, remark } = splitFragment(input);
  const withoutScheme = base.slice('vless://'.length);
  const atIdx = withoutScheme.lastIndexOf('@');
  if (atIdx === -1) throw new Error('لینک VLESS معتبر نیست: UUID یا آدرس سرور یافت نشد.');
  const uuid = withoutScheme.slice(0, atIdx);
  const rest = withoutScheme.slice(atIdx + 1);
  const qIdx = rest.indexOf('?');
  const hostPort = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { address, port } = splitHostPort(hostPort);
  const params = new URLSearchParams(queryStr);

  if (!uuid) throw new Error('لینک VLESS معتبر نیست: UUID یافت نشد.');
  if (!address || !port) throw new Error('لینک VLESS معتبر نیست: آدرس یا پورت سرور یافت نشد.');

  const pc = {
    protocol: 'vless',
    uuid: uuid,
    address: address,
    port: parseInt(port),
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
  if (atIdx === -1) throw new Error('لینک Trojan معتبر نیست: Password یا آدرس سرور یافت نشد.');
  const password = decodeURIComponent(withoutScheme.slice(0, atIdx));
  const rest = withoutScheme.slice(atIdx + 1);
  const qIdx = rest.indexOf('?');
  const hostPort = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { address, port } = splitHostPort(hostPort);
  const params = new URLSearchParams(queryStr);

  if (!password) throw new Error('لینک Trojan معتبر نیست: Password یافت نشد.');
  if (!address || !port) throw new Error('لینک Trojan معتبر نیست: آدرس یا پورت سرور یافت نشد.');

  const pc = {
    protocol: 'trojan',
    password: password,
    address: address,
    port: parseInt(port),
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
      throw new Error('لینک Shadowsocks معتبر نیست.');
    }
    return {
      protocol: 'shadowsocks',
      method: decoded.slice(0, colonIdx),
      password: decoded.slice(colonIdx + 1),
      address: address,
      port: parseInt(port),
      network: 'tcp',
      security: 'none',
      remark: remark || 'Chain'
    };
  }

  const qIdx = withoutScheme.indexOf('?');
  const mainPart = qIdx === -1 ? withoutScheme : withoutScheme.slice(0, qIdx);
  const decoded = tryB64Decode(mainPart);
  if (!decoded) throw new Error('لینک Shadowsocks معتبر نیست.');
  const atIdx2 = decoded.lastIndexOf('@');
  if (atIdx2 === -1) throw new Error('لینک Shadowsocks معتبر نیست.');
  const methodPass = decoded.slice(0, atIdx2);
  const hostPort = decoded.slice(atIdx2 + 1);
  const colonIdx = methodPass.indexOf(':');
  const { address, port } = splitHostPort(hostPort);
  if (colonIdx === -1 || !address || !port) {
    throw new Error('لینک Shadowsocks معتبر نیست.');
  }
  return {
    protocol: 'shadowsocks',
    method: methodPass.slice(0, colonIdx),
    password: methodPass.slice(colonIdx + 1),
    address: address,
    port: parseInt(port),
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
  if (!address || !port) throw new Error('لینک ' + (protocol === 'socks' ? 'SOCKS' : 'HTTP') + ' معتبر نیست.');

  return {
    protocol: protocol,
    user: user,
    pass: pass,
    address: address,
    port: parseInt(port),
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
  if (!schemeMatch) throw new Error('لینک کانفیگ Chain Proxy معتبر نیست.');
  const scheme = schemeMatch[1].toLowerCase();

  if (scheme === 'vless') return parseVless(input);
  if (scheme === 'trojan') return parseTrojan(input);
  if (scheme === 'ss') return parseShadowsocks(input);
  if (scheme === 'socks' || scheme === 'socks5') return parseSocksHttp(input, 'socks');
  if (scheme === 'http' || scheme === 'https') return parseSocksHttp(input, 'http');

  throw new Error('کانفیگ Chain Proxy پشتیبانی نمی‌شود.');
}