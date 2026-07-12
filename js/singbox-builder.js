function isDomainAddr(addr) {
  return /^(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,}$/.test(addr);
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
    basePath, fragEnable, fakeDnsEnable, ipv6Enable, lanAccess,
    remoteDnsVal, localDnsVal, tcpFastOpen
  } = settings;

  const useVless = !protocols || protocols.vless !== false;
  const useTrojan = !!(protocols && protocols.trojan);

  const outbounds = [];
  const proxyTags = [];

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
          server_name: dom,
          record_fragment: fragEnable,
          insecure: false,
          alpn: ['http/1.1'],
          utls: { enabled: true, fingerprint: fp }
        };
      }
      if (domainResolver) baseOutbound.domain_resolver = domainResolver;

      if (useVless) {
        const tag = `VLESS-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        outbounds.push({ type: 'vless', tag: tag, uuid: token, packet_encoding: '', ...baseOutbound });
        proxyTags.push(tag);
      }
      if (useTrojan) {
        const tag = `TROJAN-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        outbounds.push({ type: 'trojan', tag: tag, password: password, ...baseOutbound });
        proxyTags.push(tag);
      }
    });
  });

  outbounds.push({
    type: 'urltest',
    tag: '👽 Anonymous TCB',
    outbounds: proxyTags,
    url: 'https://www.gstatic.com/generate_204',
    interval: '180s',
    interrupt_exist_connections: false
  });
  outbounds.push({
    type: 'selector',
    tag: 'Best Ping 🚀',
    outbounds: ['👽 Anonymous TCB', ...proxyTags],
    interrupt_exist_connections: false
  });
  outbounds.push({ type: 'direct', tag: 'direct', domain_resolver: 'dns-direct' });

  const remoteParsed = parseDnsUrl(remoteDnsVal);
  const localParsed = parseDnsUrl(localDnsVal);

  const dnsServers = [
    { type: remoteParsed.type, server: remoteParsed.host, detour: 'Best Ping 🚀', tag: 'dns-remote' },
    { type: localParsed.type, server: localParsed.host, tag: 'dns-direct' }
  ];

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
    { clash_mode: 'Global', server: 'dns-remote' },
    { rule_set: ['geosite-ir'], server: 'dns-direct' }
  ];

  if (fakeDnsEnable) {
    dnsRules.push({ inbound: 'tun-in', query_type: ['A', 'AAAA'], server: 'dns-fake' });
  }

  const configObj = {
    log: { disabled: true, timestamp: true },
    dns: {
      servers: dnsServers,
      rules: dnsRules,
      strategy: ipv6Enable ? 'prefer_ipv4' : 'ipv4_only',
      independent_cache: true
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
        listen_port: 2080
      }
    ],
    outbounds: outbounds,
    route: {
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_is_private: true, outbound: 'direct' },
        { network: 'udp', action: 'reject' },
        { rule_set: ['geosite-ir'], outbound: 'direct' },
        { rule_set: ['geoip-ir'], outbound: 'direct' }
      ],
      rule_set: [
        {
          type: 'remote',
          tag: 'geosite-ir',
          format: 'binary',
          url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-ir.srs',
          download_detour: 'direct'
        },
        {
          type: 'remote',
          tag: 'geoip-ir',
          format: 'binary',
          url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-ir.srs',
          download_detour: 'direct'
        }
      ],
      auto_detect_interface: true,
      final: 'Best Ping 🚀'
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