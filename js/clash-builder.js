export function buildClashConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols) {
  const {
    basePath, fakeDnsEnable, ipv6Enable, lanAccess,
    remoteDnsVal, localDnsVal, tcpFastOpen, echEnable
  } = settings;

  const useVless = !protocols || protocols.vless !== false;
  const useTrojan = !!(protocols && protocols.trojan);

  const proxies = [];
  const proxyTags = [];

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
          proxy.servername = dom;
          if (echEnable) proxy['ech-opts'] = { enable: true, 'query-server-name': dom };
        }
        proxies.push(proxy);
        proxyTags.push(tag);
      }
      if (useTrojan) {
        const tag = `TROJAN-${ipLabel}-${isTls ? 'TLS' : 'WS'}${port}${isTls ? '-' + fp : ''}`;
        const proxy = { name: tag, type: 'trojan', password: password, ...baseProxy };
        if (isTls) {
          proxy.sni = dom;
        }
        proxies.push(proxy);
        proxyTags.push(tag);
      }
    });
  });

  const selectorTags = ['👽 Anonymous TCB', ...proxyTags];

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
      nameserver: [`${remoteDnsVal}#Best Ping 🚀`],
      'proxy-server-nameserver': [`${localDnsVal}#DIRECT`],
      'direct-nameserver': [`${localDnsVal}#DIRECT`],
      'direct-nameserver-follow-policy': true,
      'nameserver-policy': { 'rule-set:geosite-ir': `${localDnsVal}#DIRECT` },
      'enhanced-mode': fakeDnsEnable ? 'fake-ip' : 'redir-host',
      ...(fakeDnsEnable ? {
        'fake-ip-range': '198.18.0.1/16',
        'fake-ip-filter-mode': 'blacklist',
        'fake-ip-filter': ['+.lan', '+.local']
      } : {})
    },
    proxies: proxies,
    'proxy-groups': [
      { name: 'Best Ping 🚀', type: 'select', proxies: selectorTags },
      { name: '👽 Anonymous TCB', type: 'url-test', proxies: proxyTags, url: 'https://www.gstatic.com/generate_204', interval: 180, tolerance: 50 }
    ],
    'rule-providers': {
      'geosite-ir': {
        type: 'http',
        format: 'text',
        behavior: 'domain',
        path: './ruleset/geosite-ir.txt',
        interval: 86400,
        url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/ir.txt'
      },
      'geoip-ir': {
        type: 'http',
        format: 'text',
        behavior: 'ipcidr',
        path: './ruleset/geoip-ir.txt',
        interval: 86400,
        url: 'https://raw.githubusercontent.com/Chocolate4U/Iran-clash-rules/release/ircidr.txt'
      }
    },
    rules: [
      'GEOIP,lan,DIRECT,no-resolve',
      'NETWORK,udp,REJECT',
      'RULE-SET,geosite-ir,DIRECT',
      'RULE-SET,geoip-ir,DIRECT',
      'MATCH,Best Ping 🚀'
    ],
    ntp: { enable: true, server: 'time.cloudflare.com', port: 123, interval: 30 }
  };

  return JSON.stringify(configObj, null, 2);
}