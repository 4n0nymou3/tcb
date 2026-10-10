const APP_ID = 'tcb';
const SCHEMA_VERSION = 6;
const LEGACY_SCHEMA_VERSION = 5;

export function collectExportData() {
  return {
    appId: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      token: document.getElementById('uid').value.trim(),
      trojanPassword: document.getElementById('tpw').value.trim(),
      deployTarget: document.getElementById('tab-pages') && document.getElementById('tab-pages').classList.contains('active') ? 'pages' : 'worker',
      workerDomain: document.getElementById('wdom').value.trim(),
      customDomainUsed: document.getElementById('customDomainUsed').checked,
      customDomain: document.getElementById('customDomainInput').value,
      fallbackDomain: document.getElementById('fallbackDomain').value.trim(),
      ips: document.getElementById('ips').value,
      protocols: {
        vless: document.getElementById('protoVless').checked,
        trojan: document.getElementById('protoTrojan').checked
      },
      tlsPorts: [...document.querySelectorAll('.ptls:checked')].map(el => el.value),
      wsPorts: [...document.querySelectorAll('.pws:checked')].map(el => el.value),
      fingerprint: document.getElementById('fpSelect').value,
      wsPath: document.getElementById('pathSelect').value,
      fragment: {
        enabled: document.getElementById('fragEnable').checked,
        packets: document.getElementById('fragPackets').value,
        interval: document.getElementById('fragInterval').value,
        length: document.getElementById('fragLength').value,
        maxSplit: document.getElementById('fragMaxSplit').value,
        stage2: {
          enabled: document.getElementById('frag2Enable').checked,
          packets: document.getElementById('frag2Packets').value,
          interval: document.getElementById('frag2Interval').value,
          length: document.getElementById('frag2Length').value,
          maxSplit: document.getElementById('frag2MaxSplit').value
        },
        xrayTls: {
          unsafeFingerprint: document.getElementById('fpUnsafeXray').checked,
          cipherSuites: document.getElementById('cipherSuitesXray').value
        }
      },
      advancedJson: {
        fakeDns: document.getElementById('fakeDns').value,
        ipv6: document.getElementById('ipv6').value,
        lanAccess: document.getElementById('lanAccess').value,
        tcpFastOpen: document.getElementById('tcpFastOpen').value
      },
      ech: {
        enabled: document.getElementById('echEnable').checked,
        dns: document.getElementById('echDns').value
      },
      dns: {
        local: document.getElementById('localDns').value,
        remote: document.getElementById('remoteDns').value
      },
      routingCountries: {
        ir: document.getElementById('routeIr').checked,
        cn: document.getElementById('routeCn').checked,
        ru: document.getElementById('routeRu').checked
      },
      blockRules: {
        ads: document.getElementById('blockPromo').checked,
        porn: document.getElementById('blockPorn').checked,
        quic: document.getElementById('blockQuic').checked,
        malware: document.getElementById('blockMalware').checked,
        phishing: document.getElementById('blockPhishing').checked,
        cryptominers: document.getElementById('blockCryptominers').checked
      },
      sanctionDns: document.getElementById('sanctionDns').value,
      sanctionBypass: {
        openai: document.getElementById('sanctionOpenai').checked,
        googleai: document.getElementById('sanctionGoogleai').checked,
        anthropic: document.getElementById('sanctionAnthropic').checked,
        xai: document.getElementById('sanctionXai').checked,
        microsoft: document.getElementById('sanctionMicrosoft').checked,
        oracle: document.getElementById('sanctionOracle').checked,
        docker: document.getElementById('sanctionDocker').checked,
        adobe: document.getElementById('sanctionAdobe').checked,
        epicgames: document.getElementById('sanctionEpicgames').checked,
        intel: document.getElementById('sanctionIntel').checked,
        amd: document.getElementById('sanctionAmd').checked,
        nvidia: document.getElementById('sanctionNvidia').checked,
        asus: document.getElementById('sanctionAsus').checked,
        hp: document.getElementById('sanctionHp').checked,
        lenovo: document.getElementById('sanctionLenovo').checked
      },
      customSanctionRules: document.getElementById('customSanctionRules').value,
      customBypassRules: document.getElementById('customBypassRules').value,
      customBlockRules: document.getElementById('customBlockRules').value,
      observatory: {
        leastPingInterval: document.getElementById('leastPingInterval').value,
        leastLoadInterval: document.getElementById('leastLoadInterval').value,
        leastLoadMode: document.getElementById('leastLoadMode').value,
        leastLoadSampling: document.getElementById('leastLoadSampling').value,
        leastLoadTimeout: document.getElementById('leastLoadTimeout').value
      },
      chainConfig: document.getElementById('chainConfig').value,
      jsonName: document.getElementById('jsonName').value,
      telegramWebProxy: {
        enabled: document.getElementById('tgEnable').checked,
        secretBase: document.getElementById('tgSecret').dataset.base || '',
        randomPadding: document.getElementById('tgPadding').checked
      }
    }
  };
}

export function exportSettingsToString() {
  return JSON.stringify(collectExportData(), null, 2);
}

export function isValidImportPayload(payload) {
  return !!(
    payload &&
    typeof payload === 'object' &&
    payload.appId === APP_ID &&
    payload.data &&
    typeof payload.data === 'object'
  );
}

function isStr(v) {
  return typeof v === 'string';
}

function isBool(v) {
  return typeof v === 'boolean';
}

function isStrArray(v) {
  return Array.isArray(v) && v.every(isStr);
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function hasValidTelegramShape(t) {
  if (!isPlainObject(t)) return false;
  if (!isBool(t.enabled)) return false;
  if (!isBool(t.randomPadding)) return false;
  if (!isStr(t.secretBase)) return false;
  return t.secretBase === '' || /^[0-9a-f]{32}$/.test(t.secretBase);
}

function hasExactExportShape(d, version) {
  if (!isPlainObject(d)) return false;
  if (!isStr(d.token)) return false;
  if (!isStr(d.trojanPassword)) return false;
  if (d.deployTarget !== 'worker' && d.deployTarget !== 'pages') return false;
  if (!isStr(d.workerDomain)) return false;
  if (!isBool(d.customDomainUsed)) return false;
  if (!isStr(d.customDomain)) return false;
  if (!isStr(d.fallbackDomain)) return false;
  if (!isStr(d.ips)) return false;
  if (!isPlainObject(d.protocols)) return false;
  if (!isBool(d.protocols.vless)) return false;
  if (!isBool(d.protocols.trojan)) return false;
  if (!isStrArray(d.tlsPorts)) return false;
  if (!isStrArray(d.wsPorts)) return false;
  if (!isStr(d.fingerprint)) return false;
  if (!isStr(d.wsPath)) return false;

  if (!isPlainObject(d.fragment)) return false;
  if (!isBool(d.fragment.enabled)) return false;
  if (!isStr(d.fragment.packets)) return false;
  if (!isStr(d.fragment.interval)) return false;
  if (!isStr(d.fragment.length)) return false;
  if (!isStr(d.fragment.maxSplit)) return false;
  if (!isPlainObject(d.fragment.stage2)) return false;
  if (!isBool(d.fragment.stage2.enabled)) return false;
  if (!isStr(d.fragment.stage2.packets)) return false;
  if (!isStr(d.fragment.stage2.interval)) return false;
  if (!isStr(d.fragment.stage2.length)) return false;
  if (!isStr(d.fragment.stage2.maxSplit)) return false;
  if (!isPlainObject(d.fragment.xrayTls)) return false;
  if (!isBool(d.fragment.xrayTls.unsafeFingerprint)) return false;
  if (!isStr(d.fragment.xrayTls.cipherSuites)) return false;

  if (!isPlainObject(d.advancedJson)) return false;
  if (!isStr(d.advancedJson.fakeDns)) return false;
  if (!isStr(d.advancedJson.ipv6)) return false;
  if (!isStr(d.advancedJson.lanAccess)) return false;
  if (!isStr(d.advancedJson.tcpFastOpen)) return false;

  if (!isPlainObject(d.ech)) return false;
  if (!isBool(d.ech.enabled)) return false;
  if (!isStr(d.ech.dns)) return false;

  if (!isPlainObject(d.dns)) return false;
  if (!isStr(d.dns.local)) return false;
  if (!isStr(d.dns.remote)) return false;

  if (!isPlainObject(d.routingCountries)) return false;
  if (!isBool(d.routingCountries.ir)) return false;
  if (!isBool(d.routingCountries.cn)) return false;
  if (!isBool(d.routingCountries.ru)) return false;

  if (!isPlainObject(d.blockRules)) return false;
  if (!isBool(d.blockRules.ads)) return false;
  if (!isBool(d.blockRules.porn)) return false;
  if (!isBool(d.blockRules.quic)) return false;
  if (!isBool(d.blockRules.malware)) return false;
  if (!isBool(d.blockRules.phishing)) return false;
  if (!isBool(d.blockRules.cryptominers)) return false;

  if (!isStr(d.sanctionDns)) return false;
  if (!isPlainObject(d.sanctionBypass)) return false;
  if (!isBool(d.sanctionBypass.openai)) return false;
  if (!isBool(d.sanctionBypass.googleai)) return false;
  if (!isBool(d.sanctionBypass.anthropic)) return false;
  if (!isBool(d.sanctionBypass.xai)) return false;
  if (!isBool(d.sanctionBypass.microsoft)) return false;
  if (!isBool(d.sanctionBypass.oracle)) return false;
  if (!isBool(d.sanctionBypass.docker)) return false;
  if (!isBool(d.sanctionBypass.adobe)) return false;
  if (!isBool(d.sanctionBypass.epicgames)) return false;
  if (!isBool(d.sanctionBypass.intel)) return false;
  if (!isBool(d.sanctionBypass.amd)) return false;
  if (!isBool(d.sanctionBypass.nvidia)) return false;
  if (!isBool(d.sanctionBypass.asus)) return false;
  if (!isBool(d.sanctionBypass.hp)) return false;
  if (!isBool(d.sanctionBypass.lenovo)) return false;
  if (!isStr(d.customSanctionRules)) return false;
  if (!isStr(d.customBypassRules)) return false;
  if (!isStr(d.customBlockRules)) return false;

  if (!isPlainObject(d.observatory)) return false;
  if (!isStr(d.observatory.leastPingInterval)) return false;
  if (!isStr(d.observatory.leastLoadInterval)) return false;
  if (d.observatory.leastLoadMode !== 'HEAD' && d.observatory.leastLoadMode !== 'GET') return false;
  if (!isStr(d.observatory.leastLoadSampling)) return false;
  if (!isStr(d.observatory.leastLoadTimeout)) return false;

  if (!isStr(d.chainConfig)) return false;
  if (!isStr(d.jsonName)) return false;

  if (version === SCHEMA_VERSION && !hasValidTelegramShape(d.telegramWebProxy)) return false;

  return true;
}

export function isCompatibleExport(payload) {
  if (payload.schemaVersion === SCHEMA_VERSION) return hasExactExportShape(payload.data, SCHEMA_VERSION);
  if (payload.schemaVersion === LEGACY_SCHEMA_VERSION) return hasExactExportShape(payload.data, LEGACY_SCHEMA_VERSION);
  return false;
}

export function applyImportedSettings(payload) {
  const d = payload.data;

  document.getElementById('uid').value = d.token;
  document.getElementById('tpw').value = d.trojanPassword;
  document.getElementById('wdom').value = d.workerDomain;
  document.getElementById('customDomainUsed').checked = d.customDomainUsed;
  document.getElementById('customDomainInput').value = d.customDomain;
  document.getElementById('fallbackDomain').value = d.fallbackDomain;
  document.getElementById('ips').value = d.ips;
  document.getElementById('protoVless').checked = d.protocols.vless;
  document.getElementById('protoTrojan').checked = d.protocols.trojan;

  const tlsSet = new Set(d.tlsPorts);
  document.querySelectorAll('.ptls').forEach(el => { el.checked = tlsSet.has(el.value); });

  const wsSet = new Set(d.wsPorts);
  document.querySelectorAll('.pws').forEach(el => { el.checked = wsSet.has(el.value); });

  document.getElementById('fpSelect').value = d.fingerprint;
  document.getElementById('pathSelect').value = d.wsPath;

  document.getElementById('fragEnable').checked = d.fragment.enabled;
  document.getElementById('fragPackets').value = d.fragment.packets;
  document.getElementById('fragInterval').value = d.fragment.interval;
  document.getElementById('fragLength').value = d.fragment.length;
  document.getElementById('fragMaxSplit').value = d.fragment.maxSplit;

  document.getElementById('frag2Enable').checked = d.fragment.stage2.enabled;
  document.getElementById('frag2Packets').value = d.fragment.stage2.packets;
  document.getElementById('frag2Interval').value = d.fragment.stage2.interval;
  document.getElementById('frag2Length').value = d.fragment.stage2.length;
  document.getElementById('frag2MaxSplit').value = d.fragment.stage2.maxSplit;

  document.getElementById('fpUnsafeXray').checked = d.fragment.xrayTls.unsafeFingerprint;
  document.getElementById('cipherSuitesXray').value = d.fragment.xrayTls.cipherSuites;

  document.getElementById('fakeDns').value = d.advancedJson.fakeDns;
  document.getElementById('ipv6').value = d.advancedJson.ipv6;
  document.getElementById('lanAccess').value = d.advancedJson.lanAccess;
  document.getElementById('tcpFastOpen').value = d.advancedJson.tcpFastOpen;

  document.getElementById('echEnable').checked = d.ech.enabled;
  document.getElementById('echDns').value = d.ech.dns;

  document.getElementById('localDns').value = d.dns.local;
  document.getElementById('remoteDns').value = d.dns.remote;

  document.getElementById('routeIr').checked = d.routingCountries.ir;
  document.getElementById('routeCn').checked = d.routingCountries.cn;
  document.getElementById('routeRu').checked = d.routingCountries.ru;

  document.getElementById('blockPromo').checked = d.blockRules.ads;
  document.getElementById('blockPorn').checked = d.blockRules.porn;
  document.getElementById('blockQuic').checked = d.blockRules.quic;
  document.getElementById('blockMalware').checked = d.blockRules.malware;
  document.getElementById('blockPhishing').checked = d.blockRules.phishing;
  document.getElementById('blockCryptominers').checked = d.blockRules.cryptominers;

  document.getElementById('sanctionDns').value = d.sanctionDns;
  document.getElementById('sanctionOpenai').checked = d.sanctionBypass.openai;
  document.getElementById('sanctionGoogleai').checked = d.sanctionBypass.googleai;
  document.getElementById('sanctionAnthropic').checked = d.sanctionBypass.anthropic;
  document.getElementById('sanctionXai').checked = d.sanctionBypass.xai;
  document.getElementById('sanctionMicrosoft').checked = d.sanctionBypass.microsoft;
  document.getElementById('sanctionOracle').checked = d.sanctionBypass.oracle;
  document.getElementById('sanctionDocker').checked = d.sanctionBypass.docker;
  document.getElementById('sanctionAdobe').checked = d.sanctionBypass.adobe;
  document.getElementById('sanctionEpicgames').checked = d.sanctionBypass.epicgames;
  document.getElementById('sanctionIntel').checked = d.sanctionBypass.intel;
  document.getElementById('sanctionAmd').checked = d.sanctionBypass.amd;
  document.getElementById('sanctionNvidia').checked = d.sanctionBypass.nvidia;
  document.getElementById('sanctionAsus').checked = d.sanctionBypass.asus;
  document.getElementById('sanctionHp').checked = d.sanctionBypass.hp;
  document.getElementById('sanctionLenovo').checked = d.sanctionBypass.lenovo;
  document.getElementById('customSanctionRules').value = d.customSanctionRules;
  document.getElementById('customBypassRules').value = d.customBypassRules;
  document.getElementById('customBlockRules').value = d.customBlockRules;

  document.getElementById('leastPingInterval').value = d.observatory.leastPingInterval;
  document.getElementById('leastLoadInterval').value = d.observatory.leastLoadInterval;
  document.getElementById('leastLoadMode').value = d.observatory.leastLoadMode;
  document.getElementById('leastLoadSampling').value = d.observatory.leastLoadSampling;
  document.getElementById('leastLoadTimeout').value = d.observatory.leastLoadTimeout;

  document.getElementById('chainConfig').value = d.chainConfig;
  document.getElementById('jsonName').value = d.jsonName;

  const tg = payload.schemaVersion === SCHEMA_VERSION ? d.telegramWebProxy : { enabled: false, secretBase: '', randomPadding: false };
  document.getElementById('tgEnable').checked = tg.enabled;
  document.getElementById('tgPadding').checked = tg.randomPadding;
  document.getElementById('tgSecret').dataset.base = tg.secretBase;
  delete document.getElementById('tgSecret').dataset.draft;

  return d.deployTarget;
}