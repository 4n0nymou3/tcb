import { randomizeCase, resolveSelectedCountries, resolveSelectedBlockRules, resolveSelectedSanctionRules, durationToSeconds, resolveTcbLabel, resolveLanAuth, resolveLogLevel } from './proxy-utils.js';

function isDomainAddr(addr) {
  return /^(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,}$/.test(addr);
}

function buildChainTransportSingbox(pc) {
  if (pc.network === 'ws') {
    return { type: 'ws', path: pc.path || '/', headers: pc.host ? { Host: pc.host } : {} };
  }
  if (pc.network === 'grpc') {
    return { type: 'grpc', service_name: pc.serviceName || '' };
  }
  return undefined;
}

function buildChainTlsSingbox(pc) {
  if (pc.security === 'tls') {
    return {
      enabled: true,
      server_name: pc.sni || pc.address,
      insecure: false,
      alpn: pc.alpn,
      utls: { enabled: true, fingerprint: pc.fp || 'chrome' }
    };
  }
  if (pc.security === 'reality') {
    return {
      enabled: true,
      server_name: pc.sni || pc.address,
      utls: { enabled: true, fingerprint: pc.fp || 'chrome' },
      reality: { enabled: true, public_key: pc.pbk, short_id: pc.sid || '' }
    };
  }
  return undefined;
}

function buildChainOutboundSingbox(pc, detourTag, tag) {
  const transport = buildChainTransportSingbox(pc);
  const tls = buildChainTlsSingbox(pc);
  const base = { tag: tag, server: pc.address, server_port: pc.port, detour: detourTag };
  if (transport) base.transport = transport;
  if (tls) base.tls = tls;

  if (pc.protocol === 'vless') {
    const out = { type: 'vless', uuid: pc.uuid, packet_encoding: '', ...base };
    if (pc.flow) out.flow = pc.flow;
    return out;
  }
  if (pc.protocol === 'trojan') {
    return { type: 'trojan', password: pc.password, ...base };
  }
  if (pc.protocol === 'shadowsocks') {
    return { type: 'shadowsocks', method: pc.method, password: pc.password, ...base };
  }
  if (pc.protocol === 'socks') {
    const out = { type: 'socks', version: '5', ...base };
    if (pc.user) { out.username = pc.user; out.password = pc.pass; }
    return out;
  }
  if (pc.protocol === 'http') {
    const out = { type: 'http', ...base };
    if (pc.user) { out.username = pc.user; out.password = pc.pass; }
    return out;
  }
}

const SINGBOX_GEOSITE_SUFFIX = { ir: 'ir', cn: 'cn', ru: 'category-ru' };
const SINGBOX_GEOIP_SUFFIX = { ir: 'ir', cn: 'cn', ru: 'ru' };

const SINGBOX_BLOCK_RULESETS = {
  ads: ['geosite-category-ads-all'],
  porn: ['geosite-nsfw'],
  malware: ['geosite-malware', 'geoip-malware'],
  phishing: ['geosite-phishing', 'geoip-phishing'],
  cryptominers: ['geosite-cryptominers']
};

const SINGBOX_BLOCK_RULESET_URLS = {
  'geosite-category-ads-all': 'geosite-category-ads-all.srs',
  'geosite-nsfw': 'geosite-nsfw.srs',
  'geosite-malware': 'geosite-malware.srs',
  'geoip-malware': 'geoip-malware.srs',
  'geosite-phishing': 'geosite-phishing.srs',
  'geoip-phishing': 'geoip-phishing.srs',
  'geosite-cryptominers': 'geosite-cryptominers.srs'
};

const SINGBOX_SANCTION_RULESETS = {
  openai: 'geosite-openai',
  googleai: 'geosite-google-deepmind',
  anthropic: 'geosite-anthropic',
  xai: 'geosite-xai',
  microsoft: 'geosite-microsoft',
  oracle: 'geosite-oracle',
  docker: 'geosite-docker',
  adobe: 'geosite-adobe',
  epicgames: 'geosite-epicgames',
  intel: 'geosite-intel',
  amd: 'geosite-amd',
  nvidia: 'geosite-nvidia',
  asus: 'geosite-asus',
  hp: 'geosite-hp',
  lenovo: 'geosite-lenovo'
};

function toSingboxCidr(ip) {
  if (ip.includes('/')) return ip;
  return ip.includes(':') ? ip + '/128' : ip + '/32';
}

function parseDnsUrl(value) {
  try {
    const u = new URL(value);
    const type = u.protocol.replace(':', '');
    return { type: type || 'udp', host: u.hostname };
  } catch (e) {
    return { type: 'udp', host: value };
  }
}

export function buildSingboxConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols) {
  const {
    basePath, fragEnable, fakeDnsEnable, ipv6Enable, lanAccess, lanUsername, lanPassword,
    remoteDnsVal, localDnsVal, tcpFastOpen, logLevel, routingCountries, blockRules, leastPingInterval, echEnable, parsedChain, jsonName, customDomainUsed, customDomain,
    sanctionDnsVal, sanctionBypass, customBypassRules, customBlockRules, customSanctionRules
  } = settings;

  const lanAuth = resolveLanAuth(lanAccess, lanUsername, lanPassword);

  const selectedLogLevel = resolveLogLevel(logLevel);
  const singboxLog = selectedLogLevel === 'none'
    ? { disabled: true, timestamp: true }
    : { disabled: false, level: selectedLogLevel === 'warning' ? 'warn' : selectedLogLevel, timestamp: true };

  const selectedCountries = resolveSelectedCountries(routingCountries);
  const geositeTags = selectedCountries.map(c => 'geosite-' + SINGBOX_GEOSITE_SUFFIX[c]);
  const geoipTags = selectedCountries.map(c => 'geoip-' + SINGBOX_GEOIP_SUFFIX[c]);

  const selectedBlockRules = resolveSelectedBlockRules(blockRules);
  const blockQuic = !!(blockRules && blockRules.quic);
  const blockRulesetTags = [...new Set(selectedBlockRules.flatMap(c => SINGBOX_BLOCK_RULESETS[c] || []))];
  const blockDomainRulesetTags = blockRulesetTags.filter(tag => tag.startsWith('geosite-'));

  const selectedSanctionRules = resolveSelectedSanctionRules(sanctionBypass);
  const sanctionRulesetTags = [...new Set(selectedSanctionRules.map(c => SINGBOX_SANCTION_RULESETS[c]).filter(Boolean))];
  const sanctionDnsParsed = parseDnsUrl((sanctionDnsVal || '178.22.122.100').trim());

  const customBypassDomains = (customBypassRules && customBypassRules.domains) || [];
  const customBypassIps = (customBypassRules && customBypassRules.ips) || [];
  const customBlockDomains = (customBlockRules && customBlockRules.domains) || [];
  const customBlockIps = (customBlockRules && customBlockRules.ips) || [];
  const customSanctionDomains = (customSanctionRules && customSanctionRules.domains) || [];

  const intervalSeconds = durationToSeconds(leastPingInterval, 180);

  const useVless = !protocols || protocols.vless !== false;
  const useTrojan = !!(protocols && protocols.trojan);

  const outbounds = [];
  const proxyTags = [];
  const chainProxyTags = [];

  ips.forEach((ip, ipIdx) => {
    const ipLabel = `IP${ipIdx + 1}`;
    const domainResolver = isDomainAddr(ip) ? 'dns-direct' : undefined;

    [...tlsPorts.map(p => ({ port: p, isTls: true })), ...wsPorts.map(p => ({ port: p, isTls: false }))].forEach(({ port, isTls }) => {
      const baseOutbound = {
        server: ip,
        server_port: parseInt(port),
        network: 'tcp',
        tcp_fast_open: tcpFastOpen,
        transport: {
          type: 'ws',
          path: basePath,
          max_early_data: 2560,
          early_data_header_name: 'Sec-WebSocket-Protocol',
          headers: { Host: dom }
        }
      };
      if (isTls) {
        baseOutbound.tls = {
          enabled: true,
          server_name: randomizeCase(dom),
          record_fragment: fragEnable,
          insecure: false,
          alpn: ['http/1.1'],
          utls: { enabled: true, fingerprint: fp }
        };
        if (echEnable) {
          baseOutbound.tls.ech = { enabled: true, query_server_name: dom };
        }
      }
      if (domainResolver) baseOutbound.domain_resolver = domainResolver;

      if (useVless) {
        const tag = `VLESS-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        outbounds.push({ type: 'vless', tag: tag, uuid: token, packet_encoding: '', ...baseOutbound });
        proxyTags.push(tag);
        if (parsedChain) {
          const chainTag = 'chain-' + tag;
          outbounds.push(buildChainOutboundSingbox(parsedChain, tag, chainTag));
          chainProxyTags.push(chainTag);
        }
      }
      if (useTrojan) {
        const tag = `TROJAN-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        outbounds.push({ type: 'trojan', tag: tag, password: password, ...baseOutbound });
        proxyTags.push(tag);
        if (parsedChain) {
          const chainTag = 'chain-' + tag;
          outbounds.push(buildChainOutboundSingbox(parsedChain, tag, chainTag));
          chainProxyTags.push(chainTag);
        }
      }
    });
  });

  const domainMarkApplies = !!(customDomainUsed && customDomain);
  if (domainMarkApplies) {
    ips.forEach((ip, ipIdx) => {
      const ipLabel = `IP${ipIdx + 1}`;
      const domainResolver = isDomainAddr(ip) ? 'dns-direct' : undefined;

      tlsPorts.forEach(port => {
        const baseOutbound = {
          server: ip,
          server_port: parseInt(port),
          network: 'tcp',
          tcp_fast_open: tcpFastOpen,
          transport: {
            type: 'ws',
            path: basePath,
            max_early_data: 2560,
            early_data_header_name: 'Sec-WebSocket-Protocol',
            headers: { Host: customDomain }
          },
          tls: {
            enabled: true,
            server_name: randomizeCase(customDomain),
            record_fragment: fragEnable,
            insecure: false,
            alpn: ['http/1.1'],
            utls: { enabled: true, fingerprint: fp }
          }
        };
        if (echEnable) {
          baseOutbound.tls.ech = { enabled: true, query_server_name: customDomain };
        }
        if (domainResolver) baseOutbound.domain_resolver = domainResolver;

        if (useVless) {
          const tag = `VLESS-${ipLabel}-TLS${port}-${fp}-D`;
          outbounds.push({ type: 'vless', tag: tag, uuid: token, packet_encoding: '', ...baseOutbound });
          proxyTags.push(tag);
          if (parsedChain) {
            const chainTag = 'chain-' + tag;
            outbounds.push(buildChainOutboundSingbox(parsedChain, tag, chainTag));
            chainProxyTags.push(chainTag);
          }
        }
        if (useTrojan) {
          const tag = `TROJAN-${ipLabel}-TLS${port}-${fp}-D`;
          outbounds.push({ type: 'trojan', tag: tag, password: password, ...baseOutbound });
          proxyTags.push(tag);
          if (parsedChain) {
            const chainTag = 'chain-' + tag;
            outbounds.push(buildChainOutboundSingbox(parsedChain, tag, chainTag));
            chainProxyTags.push(chainTag);
          }
        }
      });
    });
  }

  const urltestTag = resolveTcbLabel(jsonName, echEnable, fragEnable, domainMarkApplies) + (parsedChain ? ' ⛓️' : '');
  const selectorTag = parsedChain ? 'Best Ping 🚀 ⛓️' : 'Best Ping 🚀';
  const activeProxyTags = parsedChain ? chainProxyTags : proxyTags;

  outbounds.push({
    type: 'urltest',
    tag: urltestTag,
    outbounds: activeProxyTags,
    url: 'https://www.gstatic.com/generate_204',
    interval: intervalSeconds + 's',
    interrupt_exist_connections: false
  });
  outbounds.push({
    type: 'selector',
    tag: selectorTag,
    outbounds: [urltestTag, ...activeProxyTags],
    interrupt_exist_connections: false
  });
  outbounds.push({ type: 'direct', tag: 'direct', domain_resolver: 'dns-direct' });

  const remoteParsed = parseDnsUrl(remoteDnsVal);
  const localParsed = parseDnsUrl(localDnsVal);

  const dnsServers = [
    { type: remoteParsed.type, server: remoteParsed.host, detour: selectorTag, tag: 'dns-remote' },
    { type: localParsed.type, server: localParsed.host, tag: 'dns-direct' }
  ];

  if (sanctionRulesetTags.length || customSanctionDomains.length) {
    dnsServers.push({ type: sanctionDnsParsed.type, server: sanctionDnsParsed.host, tag: 'dns-sanction' });
  }

  if (fakeDnsEnable) {
    dnsServers.push({
      type: 'fakeip',
      tag: 'dns-fake',
      inet4_range: '198.18.0.0/15',
      inet6_range: ipv6Enable ? 'fc00::/18' : undefined
    });
  }

  const dnsRules = [
    { clash_mode: 'Direct', server: 'dns-direct' },
    { clash_mode: 'Global', server: 'dns-remote' }
  ];

  if (blockDomainRulesetTags.length) {
    dnsRules.push({ rule_set: blockDomainRulesetTags, action: 'reject' });
  }

  if (customBlockDomains.length) {
    dnsRules.push({ domain_suffix: customBlockDomains, action: 'reject' });
  }

  dnsRules.push({ rule_set: geositeTags, server: 'dns-direct' });

  if (sanctionRulesetTags.length) {
    dnsRules.push({ rule_set: sanctionRulesetTags, server: 'dns-sanction' });
  }

  if (customSanctionDomains.length) {
    dnsRules.push({ domain_suffix: customSanctionDomains, server: 'dns-sanction' });
  }

  if (fakeDnsEnable) {
    dnsRules.push({ inbound: 'tun-in', query_type: ['A', 'AAAA'], server: 'dns-fake' });
  }

  const routeRules = [
    { action: 'sniff' },
    { protocol: 'dns', action: 'hijack-dns' },
    { ip_is_private: true, outbound: 'direct' }
  ];

  if (blockQuic) {
    routeRules.push({ network: 'udp', action: 'reject' });
  }

  if (blockRulesetTags.length) {
    routeRules.push({ rule_set: blockRulesetTags, action: 'reject' });
  }

  if (customBlockDomains.length) {
    routeRules.push({ domain_suffix: customBlockDomains, action: 'reject' });
  }
  if (customBlockIps.length) {
    routeRules.push({ ip_cidr: customBlockIps.map(toSingboxCidr), action: 'reject' });
  }

  routeRules.push({ rule_set: geositeTags, outbound: 'direct' });
  routeRules.push({ rule_set: geoipTags, outbound: 'direct' });

  if (sanctionRulesetTags.length) {
    routeRules.push({ rule_set: sanctionRulesetTags, outbound: 'direct' });
  }
  if (customSanctionDomains.length) {
    routeRules.push({ domain_suffix: customSanctionDomains, outbound: 'direct' });
  }
  if (customBypassDomains.length) {
    routeRules.push({ domain_suffix: customBypassDomains, outbound: 'direct' });
  }
  if (customBypassIps.length) {
    routeRules.push({ ip_cidr: customBypassIps.map(toSingboxCidr), outbound: 'direct' });
  }

  const countryRulesetDefs = selectedCountries.flatMap(c => [
    {
      type: 'remote',
      tag: 'geosite-' + SINGBOX_GEOSITE_SUFFIX[c],
      format: 'binary',
      url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-' + SINGBOX_GEOSITE_SUFFIX[c] + '.srs',
      http_client: { detour: 'direct' }
    },
    {
      type: 'remote',
      tag: 'geoip-' + SINGBOX_GEOIP_SUFFIX[c],
      format: 'binary',
      url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-' + SINGBOX_GEOIP_SUFFIX[c] + '.srs',
      http_client: { detour: 'direct' }
    }
  ]);

  const blockRulesetDefs = blockRulesetTags.map(tag => ({
    type: 'remote',
    tag: tag,
    format: 'binary',
    url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/' + SINGBOX_BLOCK_RULESET_URLS[tag],
    http_client: { detour: 'direct' }
  }));

  const sanctionRulesetDefs = sanctionRulesetTags.map(tag => ({
    type: 'remote',
    tag: tag,
    format: 'binary',
    url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/' + tag + '.srs',
    http_client: { detour: 'direct' }
  }));

  const configObj = {
    log: singboxLog,
    dns: {
      servers: dnsServers,
      rules: dnsRules,
      strategy: ipv6Enable ? 'prefer_ipv4' : 'ipv4_only'
    },
    ntp: {
      enabled: true,
      server: 'time.cloudflare.com',
      server_port: 123,
      domain_resolver: 'dns-direct',
      interval: '30m',
      write_to_system: false
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        address: ['172.19.0.1/28'],
        mtu: 9000,
        auto_route: true,
        strict_route: true,
        stack: 'mixed'
      },
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: lanAccess ? '0.0.0.0' : '127.0.0.1',
        listen_port: 2080,
        ...(lanAuth ? { users: [{ username: lanAuth.username, password: lanAuth.password }] } : {})
      }
    ],
    outbounds: outbounds,
    route: {
      rules: routeRules,
      rule_set: [...countryRulesetDefs, ...blockRulesetDefs, ...sanctionRulesetDefs],
      auto_detect_interface: true,
      final: selectorTag
    },
    experimental: {
      cache_file: { enabled: true, store_fakeip: true },
      clash_api: {
        external_controller: '127.0.0.1:9090',
        external_ui: 'ui',
        default_mode: 'Rule'
      }
    }
  };

  return JSON.stringify(configObj, null, 2);
}