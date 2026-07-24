import { parseChainConfig } from './chain-parser.js';

function randomizeCase(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += Math.random() < 0.5 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

export function buildConfig(token, dom, ip, port, security, fp, path, label, echActive, echDns) {
  const h = ip.includes(':') ? `[${ip}]` : ip;
  const edPath = path + '?ed=2560';
  const params = new URLSearchParams({
    encryption: 'none', security: security, type: 'ws',
    host: dom, path: edPath, allowInsecure: '0'
  });
  if (security === 'tls') {
    params.set('sni', randomizeCase(dom));
    params.set('fp', fp);
    params.set('alpn', 'http/1.1');
    if (echActive) {
      params.set('ech', echDns);
    }
  }
  const name = encodeURIComponent(`TCB-${label}`);
  return `vless://${token}@${h}:${port}?${params}#${name}`;
}

export function buildTrojanConfig(password, dom, ip, port, security, fp, path, label, echActive, echDns) {
  const h = ip.includes(':') ? `[${ip}]` : ip;
  const edPath = path + '?ed=2560';
  const params = new URLSearchParams({
    security: security, type: 'ws',
    host: dom, path: edPath, allowInsecure: '0'
  });
  if (security === 'tls') {
    params.set('sni', randomizeCase(dom));
    params.set('fp', fp);
    params.set('alpn', 'http/1.1');
    if (echActive) {
      params.set('ech', echDns);
    }
  }
  const name = encodeURIComponent(`TCB-${label}`);
  return `trojan://${encodeURIComponent(password)}@${h}:${port}?${params}#${name}`;
}

const COUNTRY_GEOSITE = {
  ir: ['domain:ir', 'geosite:category-ir'],
  cn: ['geosite:cn'],
  ru: ['geosite:category-ru']
};

const COUNTRY_GEOIP = {
  ir: ['geoip:ir'],
  cn: ['geoip:cn'],
  ru: ['geoip:ru']
};

const BLOCK_DOMAIN_TAGS = {
  ads: ['geosite:category-ads-all', 'geosite:category-ads-ir'],
  porn: ['geosite:category-porn'],
  malware: ['geosite:malware'],
  phishing: ['geosite:phishing'],
  cryptominers: ['geosite:cryptominers']
};

const BLOCK_IP_TAGS = {
  malware: ['geoip:malware'],
  phishing: ['geoip:phishing']
};

function resolveSelectedCountries(routingCountries) {
  const codes = ['ir', 'cn', 'ru'];
  const selected = codes.filter(c => routingCountries && routingCountries[c]);
  return selected.length ? selected : ['ir'];
}

function resolveSelectedBlockRules(blockRules) {
  const codes = ['ads', 'porn', 'malware', 'phishing', 'cryptominers'];
  return codes.filter(c => blockRules && blockRules[c]);
}

function buildStreamSettings(dom, path, fp, security, echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt) {
  const streamSettings = { network: 'ws', wsSettings: { headers: { Host: dom }, path: path }, sockopt: outboundSockopt };
  if (security === 'tls') {
    streamSettings.security = 'tls';
    const tlsSettings = { allowInsecure: false, fingerprint: fp, serverName: randomizeCase(dom), show: false, alpn: ['http/1.1'] };
    if (echEnable) {
      tlsSettings.echConfigList = echDns;
    }
    streamSettings.tlsSettings = tlsSettings;
  }
  if (fragEnable) {
    streamSettings.finalmask = {
      tcp: [{
        type: 'fragment',
        settings: { packets: fragPackets, length: fragLength, delay: fragInterval, maxSplit: fragMaxSplit }
      }]
    };
  }
  return streamSettings;
}

function buildChainStreamSettingsXray(pc) {
  const streamSettings = { network: pc.network };
  if (pc.network === 'ws') {
    streamSettings.wsSettings = { path: pc.path || '/', headers: pc.host ? { Host: pc.host } : {} };
  } else if (pc.network === 'grpc') {
    streamSettings.grpcSettings = { serviceName: pc.serviceName || '', multiMode: false };
  } else {
    streamSettings.tcpSettings = {};
  }

  if (pc.security === 'tls') {
    streamSettings.security = 'tls';
    streamSettings.tlsSettings = {
      allowInsecure: false,
      serverName: pc.sni || pc.address,
      fingerprint: pc.fp || 'chrome',
      alpn: pc.alpn
    };
  } else if (pc.security === 'reality') {
    streamSettings.security = 'reality';
    streamSettings.realitySettings = {
      serverName: pc.sni || pc.address,
      fingerprint: pc.fp || 'chrome',
      publicKey: pc.pbk,
      shortId: pc.sid || '',
      spiderX: '/'
    };
  }

  return streamSettings;
}

function buildChainOutboundXray(pc, dialerProxyTag, tag) {
  const streamSettings = buildChainStreamSettingsXray(pc);
  streamSettings.sockopt = { dialerProxy: dialerProxyTag };

  let protocol, settingsObj;
  if (pc.protocol === 'vless') {
    protocol = 'vless';
    const user = { id: pc.uuid, encryption: pc.encryption || 'none', level: 8 };
    if (pc.flow) user.flow = pc.flow;
    settingsObj = { vnext: [{ address: pc.address, port: pc.port, users: [user] }] };
  } else if (pc.protocol === 'trojan') {
    protocol = 'trojan';
    settingsObj = { servers: [{ address: pc.address, port: pc.port, password: pc.password, level: 8 }] };
  } else if (pc.protocol === 'shadowsocks') {
    protocol = 'shadowsocks';
    settingsObj = { servers: [{ address: pc.address, port: pc.port, method: pc.method, password: pc.password, level: 8 }] };
  } else if (pc.protocol === 'socks') {
    protocol = 'socks';
    settingsObj = { servers: [{ address: pc.address, port: pc.port, users: pc.user ? [{ user: pc.user, pass: pc.pass }] : undefined }] };
  } else if (pc.protocol === 'http') {
    protocol = 'http';
    settingsObj = { servers: [{ address: pc.address, port: pc.port, users: pc.user ? [{ user: pc.user, pass: pc.pass }] : undefined }] };
  }

  return {
    protocol: protocol,
    settings: settingsObj,
    streamSettings: streamSettings,
    mux: { concurrency: -1, enabled: false },
    tag: tag
  };
}

export function buildJsonConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols) {
  const {
    basePath, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit,
    fakeDnsEnable, ipv6Enable, lanAccess, remoteDnsVal, localDnsVal,
    tcpFastOpen, echEnable, echDns, jsonName, routingCountries, blockRules, pingInterval, chainConfig
  } = settings;

  const parsedChain = parseChainConfig(chainConfig);

  const path = basePath + '?ed=2560';
  const useVless = !protocols || protocols.vless !== false;
  const useTrojan = !!(protocols && protocols.trojan);

  const selectedCountries = resolveSelectedCountries(routingCountries);
  const directDomains = [...new Set(selectedCountries.flatMap(c => COUNTRY_GEOSITE[c] || []))];
  const directIps = [...new Set(selectedCountries.flatMap(c => COUNTRY_GEOIP[c] || []))];

  const selectedBlockRules = resolveSelectedBlockRules(blockRules);
  const blockQuic = !!(blockRules && blockRules.quic);
  const blockDomains = [...new Set(selectedBlockRules.flatMap(c => BLOCK_DOMAIN_TAGS[c] || []))];
  const blockIps = [...new Set(selectedBlockRules.flatMap(c => BLOCK_IP_TAGS[c] || []))];

  const intervalSeconds = parseInt(pingInterval) > 0 ? parseInt(pingInterval) : 180;

  const outboundSockopt = {
    domainStrategy: 'UseIP',
    tcpFastOpen: tcpFastOpen,
    happyEyeballs: { tryDelayMs: 250, prioritizeIPv6: false, interleave: 2, maxConcurrentTry: 4 }
  };

  const outbounds = [];
  let idx = 1;
  let firstProxyTag = null;
  let firstChainTag = null;

  ips.forEach(ip => {
    [...tlsPorts.map(p => ({ port: p, security: 'tls' })), ...wsPorts.map(p => ({ port: p, security: 'none' }))].forEach(({ port, security }) => {
      if (useVless) {
        const tag = 'vless-proxy-' + idx;
        if (!firstProxyTag) firstProxyTag = tag;
        outbounds.push({
          mux: { concurrency: -1, enabled: false },
          protocol: 'vless',
          settings: { vnext: [{ address: ip, port: parseInt(port), users: [{ encryption: 'none', id: token, level: 8 }] }] },
          streamSettings: buildStreamSettings(dom, path, fp, security, echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt),
          tag: tag
        });
        if (parsedChain) {
          const chainTag = 'chain-' + tag;
          if (!firstChainTag) firstChainTag = chainTag;
          outbounds.push(buildChainOutboundXray(parsedChain, tag, chainTag));
        }
      }
      if (useTrojan) {
        const tag = 'trojan-proxy-' + idx;
        if (!firstProxyTag) firstProxyTag = tag;
        outbounds.push({
          mux: { concurrency: -1, enabled: false },
          protocol: 'trojan',
          settings: { servers: [{ address: ip, port: parseInt(port), password: password, level: 8 }] },
          streamSettings: buildStreamSettings(dom, path, fp, security, echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt),
          tag: tag
        });
        if (parsedChain) {
          const chainTag = 'chain-' + tag;
          if (!firstChainTag) firstChainTag = chainTag;
          outbounds.push(buildChainOutboundXray(parsedChain, tag, chainTag));
        }
      }
      idx++;
    });
  });

  const balancerSelector = [];
  if (parsedChain) {
    if (useVless) balancerSelector.push('chain-vless-proxy-');
    if (useTrojan) balancerSelector.push('chain-trojan-proxy-');
  } else {
    if (useVless) balancerSelector.push('vless-proxy-');
    if (useTrojan) balancerSelector.push('trojan-proxy-');
  }
  const balancerFallbackTag = parsedChain ? firstChainTag : firstProxyTag;

  outbounds.push({ protocol: 'freedom', settings: { domainStrategy: 'UseIP' }, tag: 'direct' });
  outbounds.push({ protocol: 'blackhole', settings: { response: { type: 'http' } }, tag: 'block' });
  outbounds.push({ protocol: 'dns', settings: { rules: [{ action: 'hijack' }] }, tag: 'dns-out' });

  const dnsServers = [];
  if (fakeDnsEnable) {
    dnsServers.push({ address: 'fakedns', domains: directDomains });
  }
  dnsServers.push(remoteDnsVal);
  const domesticTags = [];
  selectedCountries.forEach(c => {
    const tag = 'domestic-dns-' + c;
    dnsServers.push({
      address: localDnsVal,
      domains: COUNTRY_GEOSITE[c] || [],
      expectIPs: COUNTRY_GEOIP[c] || [],
      skipFallback: true,
      tag: tag
    });
    domesticTags.push(tag);
  });

  const sniffingDestOverride = fakeDnsEnable ? ['http', 'tls', 'fakedns'] : ['http', 'tls'];

  const configObj = {
    version: { min: '26.3.27' },
    dns: {
      hosts: {
        'domain:googleapis.cn': 'googleapis.com',
        'dns.alidns.com': ['223.5.5.5', '223.6.6.6', '2400:3200::1', '2400:3200:baba::1'],
        'one.one.one.one': ['1.1.1.1', '1.0.0.1', '2606:4700:4700::1111', '2606:4700:4700::1001'],
        'dns.cloudflare.com': ['104.16.132.229', '104.16.133.229', '2606:4700::6810:84e5', '2606:4700::6810:85e5'],
        'cloudflare-dns.com': ['104.16.248.249', '104.16.249.249', '2606:4700::6810:f8f9', '2606:4700::6810:f9f9'],
        'dot.pub': ['1.12.12.12', '120.53.53.53'],
        'dns.google': ['8.8.8.8', '8.8.4.4', '2001:4860:4860::8888', '2001:4860:4860::8844'],
        'dns.quad9.net': ['9.9.9.9', '149.112.112.112', '2620:fe::fe', '2620:fe::9'],
        'common.dot.dns.yandex.net': ['77.88.8.8', '77.88.8.1', '2a02:6b8::feed:0ff', '2a02:6b8:0:1::feed:0ff']
      },
      servers: dnsServers,
      queryStrategy: ipv6Enable ? 'UseIP' : 'UseIPv4',
      tag: 'dns-module'
    },
    inbounds: [
      {
        listen: lanAccess ? '0.0.0.0' : '127.0.0.1',
        port: 10808,
        protocol: 'mixed',
        settings: { auth: 'noauth', udp: true, userLevel: 8 },
        sniffing: { destOverride: sniffingDestOverride, enabled: true, routeOnly: true },
        tag: 'mixed-in'
      },
      {
        listen: lanAccess ? '0.0.0.0' : '127.0.0.1',
        port: 10853,
        protocol: 'dokodemo-door',
        settings: { address: '1.1.1.1', network: 'tcp,udp', port: 53 },
        tag: 'dns-in'
      }
    ],
    log: { loglevel: 'none' },
    observatory: { enableConcurrency: true, probeInterval: intervalSeconds + 's', probeUrl: 'https://www.gstatic.com/generate_204', subjectSelector: balancerSelector },
    outbounds: outbounds,
    policy: {
      levels: { '8': { connIdle: 300, downlinkOnly: 1, handshake: 4, uplinkOnly: 1 } },
      system: { statsOutboundUplink: true, statsOutboundDownlink: true }
    },
    remarks: (jsonName || (fragEnable ? '👽 Anonymous TCB (Fragment) 🚀' : '👽 Anonymous TCB (Normal) 🚀')) + (parsedChain ? ' ⛓️' : ''),
    routing: {
      balancers: [{ selector: balancerSelector, strategy: { type: 'leastPing' }, tag: 'proxy-round', fallbackTag: balancerFallbackTag }],
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { inboundTag: ['mixed-in'], outboundTag: 'dns-out', port: '53', type: 'field' },
        { inboundTag: ['dns-in'], outboundTag: 'dns-out', type: 'field' },
        { ip: ['geoip:private'], outboundTag: 'direct', type: 'field' },
        { domain: ['geosite:private'], outboundTag: 'direct', type: 'field' },
        ...(blockQuic ? [{ network: 'udp', outboundTag: 'block', type: 'field' }] : []),
        ...(blockDomains.length ? [{ domain: blockDomains, outboundTag: 'block', type: 'field' }] : []),
        ...(blockIps.length ? [{ ip: blockIps, outboundTag: 'block', type: 'field' }] : []),
        { domain: directDomains, outboundTag: 'direct', type: 'field' },
        { ip: directIps, outboundTag: 'direct', type: 'field' },
        { inboundTag: domesticTags, outboundTag: 'direct', type: 'field' },
        { balancerTag: 'proxy-round', inboundTag: ['dns-module'], type: 'field' },
        { balancerTag: 'proxy-round', network: 'tcp,udp', type: 'field' }
      ]
    },
    stats: {}
  };

  if (fakeDnsEnable) {
    configObj.fakedns = [{ ipPool: '198.18.0.0/15', poolSize: 10000 }];
  }

  return JSON.stringify(configObj, null, 2);
}