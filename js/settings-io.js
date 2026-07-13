const APP_ID = 'tcb';
const SCHEMA_VERSION = 1;

export function collectExportData() {
  return {
    appId: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      token: document.getElementById('uid').value.trim(),
      trojanPassword: document.getElementById('tpw').value.trim(),
      protocols: {
        vless: document.getElementById('protoVless').checked,
        trojan: document.getElementById('protoTrojan').checked
      },
      workerDomain: document.getElementById('wdom').value.trim(),
      ips: document.getElementById('ips').value,
      tlsPorts: [...document.querySelectorAll('.ptls:checked')].map(el => el.value),
      wsPorts: [...document.querySelectorAll('.pws:checked')].map(el => el.value),
      fingerprint: document.getElementById('fpSelect').value,
      wsPath: document.getElementById('pathSelect').value,
      fragment: {
        enabled: document.getElementById('fragEnable').checked,
        packets: document.getElementById('fragPackets').value,
        interval: document.getElementById('fragInterval').value,
        length: document.getElementById('fragLength').value,
        maxSplit: document.getElementById('fragMaxSplit').value
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
      jsonName: document.getElementById('jsonName').value
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

export function applyImportedSettings(payload) {
  const d = payload.data;

  if (typeof d.token === 'string') document.getElementById('uid').value = d.token;
  if (typeof d.trojanPassword === 'string') document.getElementById('tpw').value = d.trojanPassword;
  if (d.protocols && typeof d.protocols === 'object') {
    document.getElementById('protoVless').checked = d.protocols.vless !== false;
    document.getElementById('protoTrojan').checked = !!d.protocols.trojan;
  }
  if (typeof d.workerDomain === 'string') document.getElementById('wdom').value = d.workerDomain;
  if (typeof d.ips === 'string') document.getElementById('ips').value = d.ips;

  const tlsSet = new Set(Array.isArray(d.tlsPorts) ? d.tlsPorts : []);
  document.querySelectorAll('.ptls').forEach(el => { el.checked = tlsSet.has(el.value); });

  const wsSet = new Set(Array.isArray(d.wsPorts) ? d.wsPorts : []);
  document.querySelectorAll('.pws').forEach(el => { el.checked = wsSet.has(el.value); });

  if (typeof d.fingerprint === 'string') document.getElementById('fpSelect').value = d.fingerprint;
  if (typeof d.wsPath === 'string') document.getElementById('pathSelect').value = d.wsPath;

  if (d.fragment && typeof d.fragment === 'object') {
    document.getElementById('fragEnable').checked = !!d.fragment.enabled;
    if (typeof d.fragment.packets === 'string') document.getElementById('fragPackets').value = d.fragment.packets;
    if (typeof d.fragment.interval === 'string') document.getElementById('fragInterval').value = d.fragment.interval;
    if (typeof d.fragment.length === 'string') document.getElementById('fragLength').value = d.fragment.length;
    if (typeof d.fragment.maxSplit === 'string') document.getElementById('fragMaxSplit').value = d.fragment.maxSplit;
  }

  if (d.advancedJson && typeof d.advancedJson === 'object') {
    if (typeof d.advancedJson.fakeDns === 'string') document.getElementById('fakeDns').value = d.advancedJson.fakeDns;
    if (typeof d.advancedJson.ipv6 === 'string') document.getElementById('ipv6').value = d.advancedJson.ipv6;
    if (typeof d.advancedJson.lanAccess === 'string') document.getElementById('lanAccess').value = d.advancedJson.lanAccess;
    if (typeof d.advancedJson.tcpFastOpen === 'string') document.getElementById('tcpFastOpen').value = d.advancedJson.tcpFastOpen;
  }

  if (d.ech && typeof d.ech === 'object') {
    document.getElementById('echEnable').checked = !!d.ech.enabled;
    if (typeof d.ech.dns === 'string') document.getElementById('echDns').value = d.ech.dns;
  }

  if (d.dns && typeof d.dns === 'object') {
    if (typeof d.dns.local === 'string') document.getElementById('localDns').value = d.dns.local;
    if (typeof d.dns.remote === 'string') document.getElementById('remoteDns').value = d.dns.remote;
  }

  if (typeof d.jsonName === 'string') document.getElementById('jsonName').value = d.jsonName;
}