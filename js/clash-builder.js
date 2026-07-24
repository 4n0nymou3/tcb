import { parseChainConfig } from './chain-parser.js';

const CLASH_COUNTRY_RULES = {
  ir: {
    geosite: { path: './ruleset/geosite-ir.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/ir.txt', format: 'text', behavior: 'domain' },
    geoip: { path: './ruleset/geoip-ir.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/ircidr.txt', format: 'text', behavior: 'ipcidr' }
  },
  cn: {
    geosite: { path: './ruleset/geosite-cn.yaml', url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.yaml', format: 'yaml', behavior: 'domain' },
    geoip: { path: './ruleset/geoip-cn.yaml', url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.yaml', format: 'yaml', behavior: 'ipcidr' }
  },
  ru: {
    geosite: { path: './ruleset/geosite-ru.yaml', url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ru.yaml', format: 'yaml', behavior: 'domain' },
    geoip: { path: './ruleset/geoip-ru.yaml', url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/ru.yaml', format: 'yaml', behavior: 'ipcidr' }
  }
};

const CLASH_BLOCK_RULES = {
  ads: [
    { name: 'category-ads-all', behavior: 'domain', path: './ruleset/category-ads-all.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/category-ads-all.txt' }
  ],
  porn: [
    { name: 'nsfw', behavior: 'domain', path: './ruleset/nsfw.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/nsfw.txt' }
  ],
  malware: [
    { name: 'malware', behavior: 'domain', path: './ruleset/malware.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/malware.txt' },
    { name: 'malware-cidr', behavior: 'ipcidr', path: './ruleset/malware-cidr.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/malware-ip.txt' }
  ],
  phishing: [
    { name: 'phishing', behavior: 'domain', path: './ruleset/phishing.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/phishing.txt' },
    { name: 'phishing-cidr', behavior: 'ipcidr', path: './ruleset/phishing-cidr.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/phishing-ip.txt' }
  ],
  cryptominers: [
    { name: 'cryptominers', behavior: 'domain', path: './ruleset/cryptominers.txt', url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/cryptominers.txt' }
  ]
};

function resolveSelectedCountries(routingCountries) {
  const codes = ['ir', 'cn', 'ru'];
  const selected = codes.filter(c => routingCountries && routingCountries[c]);
  return selected.length ? selected : ['ir'];
}

function randomizeCase(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += Math.random() < 0.5 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

function resolveSelectedBlockRules(blockRules) {
  const codes = ['ads', 'porn', 'malware', 'phishing', 'cryptominers'];
  return codes.filter(c => blockRules && blockRules[c]);
}

function buildChainTransportClash(pc) {
  if (pc.network === 'ws') {
    return { 'ws-opts': { path: pc.path || '/', headers: pc.host ? { Host: pc.host } : {} } };
  }
  if (pc.network === 'grpc') {
    return { 'grpc-opts': { 'grpc-service-name': pc.serviceName || '' } };
  }
  return {};
}

function buildChainProxyClash(pc, dialerProxyName, name) {
  const transportOpts = buildChainTransportClash(pc);
  const base = {
    name: name,
    server: pc.address,
    port: pc.port,
    'dialer-proxy': dialerProxyName,
    ...transportOpts
  };
  if (pc.network !== 'tcp') base.network = pc.network;

  if (pc.security === 'tls') {
    base.tls = true;
    base['skip-cert-verify'] = false;
    base['client-fingerprint'] = pc.fp === 'randomized' ? 'random' : (pc.fp || 'chrome');
    if (pc.alpn) base.alpn = pc.alpn;
  } else if (pc.security === 'reality') {
    base.tls = true;
    base['client-fingerprint'] = pc.fp === 'randomized' ? 'random' : (pc.fp || 'chrome');
    base['reality-opts'] = { 'public-key': pc.pbk, 'short-id': pc.sid || '' };
  }

  if (pc.protocol === 'vless') {
    base.type = 'vless';
    base.uuid = pc.uuid;
    if (base.tls) base.servername = pc.sni || pc.address;
    if (pc.flow) base.flow = pc.flow;
    return base;
  }
  if (pc.protocol === 'trojan') {
    base.type = 'trojan';
    base.password = pc.password;
    if (base.tls) base.sni = pc.sni || pc.address;
    return base;
  }
  if (pc.protocol === 'shadowsocks') {
    return { name: name, type: 'ss', server: pc.address, port: pc.port, cipher: pc.method, password: pc.password, 'dialer-proxy': dialerProxyName };
  }
  if (pc.protocol === 'socks') {
    const out = { name: name, type: 'socks5', server: pc.address, port: pc.port, 'dialer-proxy': dialerProxyName };
    if (pc.user) { out.username = pc.user; out.password = pc.pass; }
    if (base.tls) out.tls = true;
    return out;
  }
  if (pc.protocol === 'http') {
    const out = { name: name, type: 'http', server: pc.address, port: pc.port, 'dialer-proxy': dialerProxyName };
    if (pc.user) { out.username = pc.user; out.password = pc.pass; }
    if (base.tls) out.tls = true;
    return out;
  }
}

export function buildClashConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols) {
  const {
    basePath, fakeDnsEnable, ipv6Enable, lanAccess,
    remoteDnsVal, localDnsVal, tcpFastOpen, echEnable, routingCountries, blockRules, pingInterval, chainConfig
  } = settings;

  const parsedChain = parseChainConfig(chainConfig);

  const selectedCountries = resolveSelectedCountries(routingCountries);
  const selectedBlockRules = resolveSelectedBlockRules(blockRules);
  const blockQuic = !!(blockRules && blockRules.quic);
  const blockProviders = selectedBlockRules.flatMap(c => CLASH_BLOCK_RULES[c] || []);
  const intervalSeconds = parseInt(pingInterval) > 0 ? parseInt(pingInterval) : 180;

  const useVless = !protocols || protocols.vless !== false;
  const useTrojan = !!(protocols && protocols.trojan);

  const proxies = [];
  const proxyTags = [];
  const chainProxyTags = [];

  ips.forEach((ip, ipIdx) => {
    const ipLabel = `IP${ipIdx + 1}`;

    [...tlsPorts.map(p => ({ port: p, isTls: true })), ...wsPorts.map(p => ({ port: p, isTls: false }))].forEach(({ port, isTls }) => {
      const baseProxy = {
        server: ip,
        port: parseInt(port),
        'packet-encoding': '',
        udp: false,
        'ip-version': ipv6Enable ? 'ipv4-prefer' : 'ipv4',
        tfo: tcpFastOpen,
        network: 'ws',
        'ws-opts': {
          path: basePath,
          'max-early-data': 2560,
          'early-data-header-name': 'Sec-WebSocket-Protocol',
          headers: { Host: dom }
        }
      };
      if (isTls) {
        baseProxy.tls = true;
        baseProxy['client-fingerprint'] = fp === 'randomized' ? 'random' : fp;
        baseProxy['skip-cert-verify'] = false;
        baseProxy.alpn = ['http/1.1'];
      }

      if (useVless) {
        const tag = `VLESS-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        const proxy = { name: tag, type: 'vless', uuid: token, ...baseProxy };
        if (isTls) {
          proxy.servername = randomizeCase(dom);
          if (echEnable) proxy['ech-opts'] = { enable: true, 'query-server-name': dom };
        }
        proxies.push(proxy);
        proxyTags.push(tag);
        if (parsedChain) {
          const chainTag = 'chain-' + tag;
          proxies.push(buildChainProxyClash(parsedChain, tag, chainTag));
          chainProxyTags.push(chainTag);
        }
      }
      if (useTrojan) {
        const tag = `TROJAN-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        const proxy = { name: tag, type: 'trojan', password: password, ...baseProxy };
        if (isTls) {
          proxy.sni = randomizeCase(dom);
          if (echEnable) proxy['ech-opts'] = { enable: true, 'query-server-name': dom };
        }
        proxies.push(proxy);
        proxyTags.push(tag);
        if (parsedChain) {
          const chainTag = 'chain-' + tag;
          proxies.push(buildChainProxyClash(parsedChain, tag, chainTag));
          chainProxyTags.push(chainTag);
        }
      }
    });
  });

  const urltestTag = parsedChain ? '👽 Anonymous TCB ⛓️' : '👽 Anonymous TCB';
  const selectorTag = parsedChain ? 'Best Ping 🚀 ⛓️' : 'Best Ping 🚀';
  const activeProxyTags = parsedChain ? chainProxyTags : proxyTags;
  const selectorTags = [urltestTag, ...activeProxyTags];

  const configObj = {
    'mixed-port': 7890,
    ipv6: true,
    'allow-lan': lanAccess,
    'unified-delay': false,
    'log-level': 'silent',
    mode: 'rule',
    'disable-keep-alive': false,
    'keep-alive-idle': 10,
    'keep-alive-interval': 15,
    'tcp-concurrent': true,
    'geo-auto-update': true,
    'geo-update-interval': 168,
    'external-controller': '127.0.0.1:9090',
    'external-controller-cors': { 'allow-origins': ['*'], 'allow-private-network': true },
    'external-ui': 'ui',
    profile: { 'store-selected': true, 'store-fake-ip': true },
    tun: {
      enable: true,
      stack: 'mixed',
      'auto-route': true,
      'strict-route': true,
      'auto-detect-interface': true,
      'dns-hijack': ['any:53', 'tcp://any:53'],
      mtu: 9000
    },
    sniffer: {
      enable: true,
      'force-dns-mapping': true,
      'parse-pure-ip': true,
      'override-destination': true,
      sniff: {
        HTTP: { ports: wsPorts.map(Number) },
        TLS: { ports: tlsPorts.map(Number) }
      }
    },
    dns: {
      enable: true,
      'respect-rules': true,
      'use-system-hosts': false,
      listen: `${lanAccess ? '0.0.0.0' : '127.0.0.1'}:1053`,
      ipv6: ipv6Enable,
      hosts: Object.fromEntries(blockProviders.map(p => ['rule-set:' + p.name, 'rcode://refused'])),
      nameserver: [`${remoteDnsVal}#${selectorTag}`],
      'proxy-server-nameserver': [`${localDnsVal}#DIRECT`],
      'direct-nameserver': [`${localDnsVal}#DIRECT`],
      'direct-nameserver-follow-policy': true,
      'nameserver-policy': Object.fromEntries(selectedCountries.map(c => ['rule-set:geosite-' + c, `${localDnsVal}#DIRECT`])),
      'enhanced-mode': fakeDnsEnable ? 'fake-ip' : 'redir-host',
      ...(fakeDnsEnable ? {
        'fake-ip-range': '198.18.0.1/16',
        'fake-ip-filter-mode': 'blacklist',
        'fake-ip-filter': ['+.lan', '+.local']
      } : {})
    },
    proxies: proxies,
    'proxy-groups': [
      { name: selectorTag, type: 'select', proxies: selectorTags },
      { name: urltestTag, type: 'url-test', proxies: activeProxyTags, url: 'https://www.gstatic.com/generate_204', interval: intervalSeconds, tolerance: 50 }
    ],
    'rule-providers': Object.fromEntries([
      ...selectedCountries.flatMap(c => {
        const rules = CLASH_COUNTRY_RULES[c];
        return [
          ['geosite-' + c, {
            type: 'http',
            format: rules.geosite.format,
            behavior: rules.geosite.behavior,
            path: rules.geosite.path,
            interval: 86400,
            url: rules.geosite.url
          }],
          ['geoip-' + c, {
            type: 'http',
            format: rules.geoip.format,
            behavior: rules.geoip.behavior,
            path: rules.geoip.path,
            interval: 86400,
            url: rules.geoip.url
          }]
        ];
      }),
      ...blockProviders.map(p => [p.name, {
        type: 'http',
        format: 'text',
        behavior: p.behavior,
        path: p.path,
        interval: 86400,
        url: p.url
      }])
    ]),
    rules: [
      'GEOIP,lan,DIRECT,no-resolve',
      ...(blockQuic ? ['NETWORK,udp,REJECT'] : []),
      ...blockProviders.map(p => `RULE-SET,${p.name},REJECT`),
      ...selectedCountries.flatMap(c => [`RULE-SET,geosite-${c},DIRECT`, `RULE-SET,geoip-${c},DIRECT`]),
      'MATCH,' + selectorTag
    ],
    ntp: { enable: true, server: 'time.cloudflare.com', port: 123, interval: 30 }
  };

  return JSON.stringify(configObj, null, 2);
}