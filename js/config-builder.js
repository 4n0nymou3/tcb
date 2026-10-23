import { randomizeCase, resolveSelectedCountries, resolveSelectedBlockRules, resolveSelectedSanctionRules, resolveTcbLabel, resolveLanAuth } from './proxy-utils.js';

export function buildConfig(token, dom, ip, port, security, fp, path, label, echActive, echDns) {
  const h = ip.includes(':') ? `[${ip}]` : ip;
  const edPath = path + '?ed=2560';
  const params = new URLSearchParams({
    encryption: 'none', security: security, type: 'ws',
    host: dom, path: edPath
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
    host: dom, path: edPath
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

const SANCTION_GEOSITE = {
  openai: 'geosite:openai',
  googleai: 'geosite:google-deepmind',
  anthropic: 'geosite:anthropic',
  xai: 'geosite:xai',
  microsoft: 'geosite:microsoft',
  oracle: 'geosite:oracle',
  docker: 'geosite:docker',
  adobe: 'geosite:adobe',
  epicgames: 'geosite:epicgames',
  intel: 'geosite:intel',
  amd: 'geosite:amd',
  nvidia: 'geosite:nvidia',
  asus: 'geosite:asus',
  hp: 'geosite:hp',
  lenovo: 'geosite:lenovo'
};

function toFinalMaskArray(raw) {
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : [String(raw).trim()];
}

function buildStreamSettings(dom, path, fp, security, echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt, advTls) {
  const streamSettings = { network: 'ws', wsSettings: { headers: { Host: dom }, path: path }, sockopt: outboundSockopt };
  if (security === 'tls') {
    streamSettings.security = 'tls';
    const tlsSettings = {
      fingerprint: (fragEnable && advTls && advTls.fpUnsafeXray) ? 'unsafe' : fp,
      serverName: randomizeCase(dom),
      show: false,
      alpn: ['http/1.1']
    };
    if (echEnable) {
      tlsSettings.echConfigList = echDns;
    }
    if (fragEnable && advTls && advTls.cipherSuitesXray) {
      tlsSettings.cipherSuites = advTls.cipherSuitesXray;
    }
    streamSettings.tlsSettings = tlsSettings;
  }
  if (fragEnable) {
    const tcpMasks = [{
      type: 'fragment',
      settings: { packets: fragPackets, lengths: toFinalMaskArray(fragLength), delays: toFinalMaskArray(fragInterval), maxSplit: fragMaxSplit }
    }];
    if (advTls && advTls.frag2Enable) {
      tcpMasks.push({
        type: 'fragment',
        settings: { packets: advTls.frag2Packets, lengths: toFinalMaskArray(advTls.frag2Length), delays: toFinalMaskArray(advTls.frag2Interval), maxSplit: advTls.frag2MaxSplit }
      });
    }
    streamSettings.finalmask = { tcp: tcpMasks };
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
    frag2Enable, frag2Packets, frag2Length, frag2Interval, frag2MaxSplit,
    fpUnsafeXray, cipherSuitesXray,
    fakeDnsEnable, ipv6Enable, lanAccess, lanUsername, lanPassword, remoteDnsVal, localDnsVal,
    tcpFastOpen, echEnable, echDns, jsonName, customDomainUsed, customDomain, routingCountries, blockRules,
    leastPingInterval, leastLoadInterval, leastLoadMode, leastLoadSampling, leastLoadTimeout, parsedChain,
    sanctionDnsVal, sanctionBypass, customBypassRules, customBlockRules, customSanctionRules
  } = settings;

  const lanAuth = resolveLanAuth(lanAccess, lanUsername, lanPassword);

  const advTls = { frag2Enable, frag2Packets, frag2Length, frag2Interval, frag2MaxSplit, fpUnsafeXray, cipherSuitesXray };

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

  const selectedSanctionRules = resolveSelectedSanctionRules(sanctionBypass);
  const sanctionDomains = [...new Set(selectedSanctionRules.map(c => SANCTION_GEOSITE[c]).filter(Boolean))];
  const sanctionDnsAddr = (sanctionDnsVal || '178.22.122.100').trim();

  const customBypassDomains = (customBypassRules && customBypassRules.domains) || [];
  const customBypassIps = (customBypassRules && customBypassRules.ips) || [];
  const customBlockDomains = (customBlockRules && customBlockRules.domains) || [];
  const customBlockIps = (customBlockRules && customBlockRules.ips) || [];
  const customSanctionDomains = (customSanctionRules && customSanctionRules.domains) || [];

  const sanctionDnsDomains = [...new Set([...sanctionDomains, ...customSanctionDomains.map(d => `domain:${d}`)])];

  const allDirectDomains = [...new Set([...directDomains, ...sanctionDomains, ...customBypassDomains.map(d => `domain:${d}`), ...customSanctionDomains.map(d => `domain:${d}`)])];
  const allDirectIps = [...new Set([...directIps, ...customBypassIps])];
  const allBlockDomains = [...new Set([...blockDomains, ...customBlockDomains.map(d => `domain:${d}`)])];
  const allBlockIps = [...new Set([...blockIps, ...customBlockIps])];

  const outboundSockopt = {
    domainStrategy: 'UseIP',
    tcpFastOpen: tcpFastOpen,
    happyEyeballs: { tryDelayMs: 250, prioritizeIPv6: false, interleave: 2, maxConcurrentTry: 4 }
  };

  const outbounds = [];
  let idx = 1;
  let firstProxyTag = null;
  let firstChainTag = null;

  if (!tlsPorts.length) return '';

  ips.forEach(ip => {
    tlsPorts.map(p => ({ port: p, security: 'tls' })).forEach(({ port, security }) => {
      if (useVless) {
        const tag = 'vless-proxy-' + idx;
        if (!firstProxyTag) firstProxyTag = tag;
        outbounds.push({
          mux: { concurrency: -1, enabled: false },
          protocol: 'vless',
          settings: { vnext: [{ address: ip, port: parseInt(port), users: [{ encryption: 'none', id: token, level: 8 }] }] },
          streamSettings: buildStreamSettings(dom, path, fp, security, echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt, advTls),
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
          streamSettings: buildStreamSettings(dom, path, fp, security, echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt, advTls),
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

  const domainMarkApplies = !!(customDomainUsed && customDomain);
  if (domainMarkApplies) {
    let idxD = 1;
    ips.forEach(ip => {
      tlsPorts.forEach(port => {
        if (useVless) {
          const tag = 'vless-proxy-d-' + idxD;
          if (!firstProxyTag) firstProxyTag = tag;
          outbounds.push({
            mux: { concurrency: -1, enabled: false },
            protocol: 'vless',
            settings: { vnext: [{ address: ip, port: parseInt(port), users: [{ encryption: 'none', id: token, level: 8 }] }] },
            streamSettings: buildStreamSettings(customDomain, path, fp, 'tls', echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt, advTls),
            tag: tag
          });
          if (parsedChain) {
            const chainTag = 'chain-' + tag;
            if (!firstChainTag) firstChainTag = chainTag;
            outbounds.push(buildChainOutboundXray(parsedChain, tag, chainTag));
          }
        }
        if (useTrojan) {
          const tag = 'trojan-proxy-d-' + idxD;
          if (!firstProxyTag) firstProxyTag = tag;
          outbounds.push({
            mux: { concurrency: -1, enabled: false },
            protocol: 'trojan',
            settings: { servers: [{ address: ip, port: parseInt(port), password: password, level: 8 }] },
            streamSettings: buildStreamSettings(customDomain, path, fp, 'tls', echEnable, echDns, fragEnable, fragPackets, fragLength, fragInterval, fragMaxSplit, outboundSockopt, advTls),
            tag: tag
          });
          if (parsedChain) {
            const chainTag = 'chain-' + tag;
            if (!firstChainTag) firstChainTag = chainTag;
            outbounds.push(buildChainOutboundXray(parsedChain, tag, chainTag));
          }
        }
        idxD++;
      });
    });
  }

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

  if (sanctionDnsDomains.length) {
    dnsServers.push({
      address: sanctionDnsAddr,
      domains: sanctionDnsDomains,
      skipFallback: true,
      tag: 'sanction-dns'
    });
  }

  const sniffingDestOverride = fakeDnsEnable ? ['http', 'tls', 'fakedns'] : ['http', 'tls'];

  const configObj = {
    version: { min: '26.7.28' },
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
        settings: lanAuth
          ? { auth: 'password', accounts: [{ user: lanAuth.username, pass: lanAuth.password }], udp: true, userLevel: 8 }
          : { auth: 'noauth', udp: true, userLevel: 8 },
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
    observatory: { enableConcurrency: true, probeInterval: leastPingInterval, probeUrl: 'https://www.gstatic.com/generate_204', subjectSelector: balancerSelector },
    burstObservatory: {
      subjectSelector: balancerSelector,
      pingConfig: {
        destination: 'https://www.gstatic.com/generate_204',
        httpMethod: leastLoadMode,
        interval: leastLoadInterval,
        sampling: parseInt(leastLoadSampling),
        timeout: leastLoadTimeout
      }
    },
    outbounds: outbounds,
    policy: {
      levels: { '8': { connIdle: 300, downlinkOnly: 1, handshake: 4, uplinkOnly: 1 } },
      system: { statsOutboundUplink: true, statsOutboundDownlink: true }
    },
    remarks: resolveTcbLabel(jsonName, echEnable, fragEnable, domainMarkApplies) + (parsedChain ? ' ⛓️' : ''),
    routing: {
      balancers: [{ selector: balancerSelector, strategy: { type: 'leastPing' }, tag: 'proxy-round', fallbackTag: balancerFallbackTag }],
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { inboundTag: ['mixed-in'], outboundTag: 'dns-out', port: '53', type: 'field' },
        { inboundTag: ['dns-in'], outboundTag: 'dns-out', type: 'field' },
        { ip: ['geoip:private'], outboundTag: 'direct', type: 'field' },
        { domain: ['geosite:private'], outboundTag: 'direct', type: 'field' },
        ...(blockQuic ? [{ network: 'udp', outboundTag: 'block', type: 'field' }] : []),
        ...(allBlockDomains.length ? [{ domain: allBlockDomains, outboundTag: 'block', type: 'field' }] : []),
        ...(allBlockIps.length ? [{ ip: allBlockIps, outboundTag: 'block', type: 'field' }] : []),
        { domain: allDirectDomains, outboundTag: 'direct', type: 'field' },
        { ip: allDirectIps, outboundTag: 'direct', type: 'field' },
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