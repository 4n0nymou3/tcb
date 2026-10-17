import { buildWorker, buildWorkerZip } from './worker-builder.js';
import { buildConfig, buildTrojanConfig, buildJsonConfig } from './config-builder.js';
import { buildSingboxConfig } from './singbox-builder.js';
import { buildClashConfig } from './clash-builder.js';
import { parseChainConfig } from './chain-parser.js';
import {
  generateTelegramBase, composeTelegramSecret, isValidTelegramBase, normalizeTelegramHostname, isValidTelegramHostname,
  telegramWorkerName, buildTelegramLink, buildTelegramPackages, zipPackage
} from './telegram-webproxy.js';
import { toast, getChecked, row, downloadFile, renderCodeBlock, highlightJsonLine, highlightJsLine, flashCopied } from './ui.js';
import { exportSettingsToString, isValidImportPayload, isCompatibleExport, applyImportedSettings } from './settings-io.js';
import { generateQRMatrix, qrMatrixToSvg } from './qrcode.js';
import { t, getLang, setLang, applyI18n } from './i18n.js';
import { parseCustomRuleList, validateLanAuth } from './proxy-utils.js';

let allC = [];
let lastJsonStr = '';
let lastSingboxStr = '';
let lastClashStr = '';
let deployTarget = 'worker';

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function genPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 24; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function renderWorker(token, password, fallbackDomain) {
  if (!token || !password) return;
  const code = await buildWorker(token, password, fallbackDomain);
  renderCodeBlock('workerDisplay', code, highlightJsLine);
}

function currentPassword() {
  return document.getElementById('tpw').value.trim();
}

function currentFallbackDomain() {
  return document.getElementById('fallbackDomain').value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function mkToken() {
  const tok = uuid4();
  document.getElementById('uid').value = tok;
  renderWorker(tok, currentPassword(), currentFallbackDomain());
  toast(t('toast.tokenUpdated'));
}

function cpToken(e) {
  const btn = e.currentTarget;
  const v = document.getElementById('uid').value.trim();
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => { toast(t('toast.tokenCopied')); flashCopied(btn); });
}

function mkPassword() {
  const p = genPassword();
  document.getElementById('tpw').value = p;
  renderWorker(document.getElementById('uid').value.trim(), p, currentFallbackDomain());
  toast(t('toast.passwordUpdated'));
}

function cpPassword(e) {
  const btn = e.currentTarget;
  const v = document.getElementById('tpw').value.trim();
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => { toast(t('toast.passwordCopied')); flashCopied(btn); });
}

async function cpWorker(e) {
  const btn = e.currentTarget;
  const token = document.getElementById('uid').value.trim();
  const password = currentPassword();
  if (!token || !password) { toast(t('toast.needTokenPassword')); return; }
  const code = await buildWorker(token, password, currentFallbackDomain());
  navigator.clipboard.writeText(code).then(() => { toast(t('toast.workerCopied')); flashCopied(btn); });
}

async function dlWorker() {
  const token = document.getElementById('uid').value.trim();
  const password = currentPassword();
  if (!token || !password) { toast(t('toast.needTokenPasswordEnter')); return; }
  const code = await buildWorker(token, password, currentFallbackDomain());
  downloadFile(code, 'worker.js', 'text/javascript');
  toast(t('toast.workerDownloaded'));
}

async function dlWorkerZip() {
  const token = document.getElementById('uid').value.trim();
  const password = currentPassword();
  if (!token || !password) { toast(t('toast.needTokenPasswordEnter')); return; }
  const zipBytes = await buildWorkerZip(token, password, currentFallbackDomain());
  downloadFile(zipBytes, 'tcb-pages-worker.zip', 'application/zip');
  toast(t('toast.workerZipDownloaded'));
}

function telegramHostname() {
  const custom = document.getElementById('customDomainUsed').checked
    ? normalizeTelegramHostname(document.getElementById('customDomainInput').value)
    : '';
  return custom || normalizeTelegramHostname(document.getElementById('wdom').value);
}

function telegramSecret() {
  const base = document.getElementById('tgSecret').dataset.base || '';
  return composeTelegramSecret(base, document.getElementById('tgPadding').checked);
}

function parseTelegramSecretInput(raw) {
  const m = /^(dd)?([0-9a-f]{32})$/.exec(String(raw || '').trim().toLowerCase());
  return m ? { base: m[2], padded: !!m[1] } : null;
}

function telegramSecretIsDraft() {
  return document.getElementById('tgSecret').dataset.draft === '1';
}

function onTelegramSecretInput() {
  const input = document.getElementById('tgSecret');
  const parsed = parseTelegramSecretInput(input.value);
  if (parsed) {
    delete input.dataset.draft;
    input.dataset.base = parsed.base;
    document.getElementById('tgPadding').checked = parsed.padded;
  } else {
    input.dataset.draft = '1';
  }
  updateTelegramUi();
}

function updateTelegramUi() {
  const enabled = document.getElementById('tgEnable').checked;
  const secretInput = document.getElementById('tgSecret');
  document.getElementById('tgBody').style.display = enabled ? 'block' : 'none';
  ['btn-cp-worker', 'btn-dl-worker'].forEach(id => { document.getElementById(id).style.display = enabled ? 'none' : ''; });
  const isPages = deployTarget === 'pages';
  document.getElementById('btn-dl-worker-zip').style.display = (isPages && !enabled) ? '' : 'none';
  document.getElementById('btn-dl-tg').textContent = t(isPages ? 'tg.downloadPages' : 'tg.download');
  if (!enabled) return;
  if (!isValidTelegramBase(secretInput.dataset.base)) secretInput.dataset.base = generateTelegramBase();
  const secret = telegramSecret();
  const host = telegramHostname();
  const draft = telegramSecretIsDraft();
  if (!draft && secretInput.value !== secret) secretInput.value = secret;
  secretInput.style.borderColor = draft ? '#e5534b' : '';
  document.getElementById('tgHost').value = host;
  const validHost = isValidTelegramHostname(host);
  document.getElementById('tgLink').value = (validHost && !draft) ? buildTelegramLink(host, secret) : '';
  const warns = [];
  if (draft) warns.push(t('tg.warnSecret'));
  if (!validHost) warns.push(t('tg.warnHost'));
  if (!document.getElementById('uid').value.trim() || !currentPassword()) warns.push(t('tg.warnCreds'));
  if (isPages) warns.push(t('tg.warnPagesName'));
  const box = document.getElementById('tgWarn');
  box.style.display = warns.length ? 'flex' : 'none';
  document.getElementById('tgWarnText').innerHTML = warns.join(' ');
}

function mkTelegramSecret() {
  const input = document.getElementById('tgSecret');
  delete input.dataset.draft;
  input.dataset.base = generateTelegramBase();
  updateTelegramUi();
  toast(t('toast.tgSecretRegenerated'));
}

function copyFrom(id, toastKey) {
  return (e) => {
    const v = document.getElementById(id).value.trim();
    if (!v) return;
    const btn = e.currentTarget;
    navigator.clipboard.writeText(v).then(() => { toast(t(toastKey)); flashCopied(btn); });
  };
}

async function dlTelegram() {
  const host = telegramHostname();
  const token = document.getElementById('uid').value.trim();
  const password = currentPassword();
  if (!isValidTelegramHostname(host)) { toast(t('toast.tgNeedHost')); return; }
  if (telegramSecretIsDraft()) { toast(t('toast.tgBadSecret')); return; }
  if (!token || !password) { toast(t('toast.needTokenPasswordEnter')); return; }
  try {
    const packages = await buildTelegramPackages({
      target: deployTarget,
      token,
      password,
      fallbackDomain: currentFallbackDomain(),
      hostname: host,
      workerName: telegramWorkerName(document.getElementById('wdom').value, 'tcb-worker'),
      lang: getLang()
    });
    for (let i = 0; i < packages.length; i++) {
      downloadFile(zipPackage(packages[i]), 'tcb-' + packages[i].filename, 'application/zip');
      if (i < packages.length - 1) await new Promise(r => setTimeout(r, 400));
    }
    toast(t('toast.tgDownloaded'));
  } catch (err) {
    toast(t('toast.tgBuildFailed'));
  }
}

function updateWsPortsAvailability() {
  const isPages = deployTarget === 'pages';
  document.getElementById('wsPortsRow').classList.toggle('disabled', isPages);
  document.getElementById('wsPortsPagesNote').style.display = isPages ? 'block' : 'none';
  document.getElementById('customDomainRow').style.display = isPages ? 'none' : 'flex';
  if (isPages) {
    document.querySelectorAll('.pws').forEach(el => { el.checked = false; });
    document.getElementById('customDomainUsed').checked = false;
    updateCustomDomainField();
  }
}

function updateCustomDomainField() {
  const enabled = document.getElementById('customDomainUsed').checked;
  const input = document.getElementById('customDomainInput');
  const wrap = document.getElementById('customDomainInputWrap');
  input.disabled = !enabled;
  wrap.classList.toggle('disabled', !enabled);
  if (!enabled) input.value = '';
}

function switchDeployTab(target) {
  deployTarget = target === 'pages' ? 'pages' : 'worker';
  const isPages = deployTarget === 'pages';
  document.getElementById('tab-worker').classList.toggle('active', !isPages);
  document.getElementById('tab-pages').classList.toggle('active', isPages);
  document.getElementById('tab-worker').setAttribute('aria-selected', String(!isPages));
  document.getElementById('tab-pages').setAttribute('aria-selected', String(isPages));
  document.getElementById('g3-desc-worker').style.display = isPages ? 'none' : 'block';
  document.getElementById('g3-desc-pages').style.display = isPages ? 'block' : 'none';
  document.getElementById('workerFname').textContent = isPages ? '_worker.js' : 'worker.js';
  updateWsPortsAvailability();
  updateTelegramUi();
}

function toggleFrag() {
  const en = document.getElementById('fragEnable').checked;
  const ff = document.getElementById('fragFields');
  const fa = document.getElementById('fragAdvFields');
  const echWrap = document.getElementById('echWrap');
  const echEnable = document.getElementById('echEnable');
  if (en) {
    ff.classList.remove('disabled');
    fa.classList.remove('disabled');
    echEnable.checked = false;
    echWrap.classList.add('ech-blocked');
    document.getElementById('echFields').classList.add('disabled');
  } else {
    ff.classList.add('disabled');
    fa.classList.add('disabled');
    echWrap.classList.remove('ech-blocked');
  }
}

function toggleFrag2() {
  const en = document.getElementById('frag2Enable').checked;
  const f2 = document.getElementById('frag2Fields');
  if (en) { f2.classList.remove('disabled'); } else { f2.classList.add('disabled'); }
}

function sanitizeDurationInput(e) {
  const raw = e.target.value;
  const m = raw.match(/^([0-9]*)([mMsS]?)/);
  let digits = m ? m[1] : '';
  let unit = m ? m[2].toLowerCase() : '';
  digits = digits.replace(/^0+(?=[0-9])/, '');
  e.target.value = digits + unit;
}

function sanitizeIntegerInput(e) {
  let digits = e.target.value.replace(/[^0-9]/g, '');
  digits = digits.replace(/^0+(?=[0-9])/, '');
  e.target.value = digits;
}

function toggleLanAuth() {
  const en = document.getElementById('lanAccess').value === '1';
  document.getElementById('lanAuthWrap').style.display = en ? '' : 'none';
}

function toggleEch() {
  const en = document.getElementById('echEnable').checked;
  const ef = document.getElementById('echFields');
  if (en) { ef.classList.remove('disabled'); } else { ef.classList.add('disabled'); }
}

function warnBlockRuleToggle(e) {
  if (!e.target.checked) return;
  const msg = getLang() === 'fa'
    ? 'فعال کردن این گزینه نیاز دارد Geo Assets کلاینت مورد استفاده‌ی شما (مثلاً Chocolate4U یا Loyalsoldier) به‌درستی تنظیم و دانلود شده باشد، وگرنه ممکن است کانفیگ تولیدشده متصل نشود. آیا مایل به ادامه هستید؟'
    : 'Enabling this option requires your client\'s Geo Assets (e.g. Chocolate4U or Loyalsoldier) to be correctly set and downloaded, otherwise the generated config may fail to connect. Do you want to continue anyway?';
  if (!confirm(msg)) {
    e.target.checked = false;
  }
}

function collectSettings() {
  const fragEnable = document.getElementById('fragEnable').checked;
  const echEnable  = document.getElementById('echEnable').checked;
  return {
    basePath:     document.getElementById('pathSelect').value,
    fragEnable:   fragEnable,
    fragPackets:  document.getElementById('fragPackets').value.trim() || 'tlshello',
    fragLength:   document.getElementById('fragLength').value.trim()  || '10-20',
    fragInterval: document.getElementById('fragInterval').value.trim() || '10-20',
    fragMaxSplit: document.getElementById('fragMaxSplit').value.trim() || '10',
    frag2Enable:  document.getElementById('frag2Enable').checked,
    frag2Packets: document.getElementById('frag2Packets').value.trim() || '1-1',
    frag2Length:  document.getElementById('frag2Length').value.trim()  || '100-200',
    frag2Interval: document.getElementById('frag2Interval').value.trim() || '10-20',
    frag2MaxSplit: document.getElementById('frag2MaxSplit').value.trim() || '10',
    fpUnsafeXray: document.getElementById('fpUnsafeXray').checked,
    cipherSuitesXray: document.getElementById('cipherSuitesXray').value.trim(),
    fakeDnsEnable: document.getElementById('fakeDns').value === '1',
    ipv6Enable:   document.getElementById('ipv6').value === '1',
    lanAccess:    document.getElementById('lanAccess').value === '1',
    lanUsername:  document.getElementById('lanUsername').value,
    lanPassword:  document.getElementById('lanPassword').value,
    remoteDnsVal: document.getElementById('remoteDns').value.trim() || 'https://cloudflare-dns.com/dns-query',
    localDnsVal:  document.getElementById('localDns').value.trim()  || '8.8.8.8',
    tcpFastOpen:  document.getElementById('tcpFastOpen').value === '1',
    echEnable:    echEnable && !fragEnable,
    echDns:       document.getElementById('echDns').value.trim() || 'https://cloudflare-dns.com/dns-query',
    jsonName:     document.getElementById('jsonName').value.trim(),
    customDomainUsed: document.getElementById('customDomainUsed').checked,
    customDomain: document.getElementById('customDomainInput').value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
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
    sanctionDnsVal: document.getElementById('sanctionDns').value.trim() || '178.22.122.100',
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
    customBypassRulesRaw: document.getElementById('customBypassRules').value,
    customBlockRulesRaw: document.getElementById('customBlockRules').value,
    customBypassRules: parseCustomRuleList(document.getElementById('customBypassRules').value),
    customBlockRules: parseCustomRuleList(document.getElementById('customBlockRules').value),
    customSanctionRulesRaw: document.getElementById('customSanctionRules').value,
    customSanctionRules: parseCustomRuleList(document.getElementById('customSanctionRules').value),
    leastPingInterval: document.getElementById('leastPingInterval').value.trim() || '3m',
    leastLoadInterval: document.getElementById('leastLoadInterval').value.trim() || '5m',
    leastLoadMode: document.getElementById('leastLoadMode').value,
    leastLoadSampling: document.getElementById('leastLoadSampling').value.trim() || '2',
    leastLoadTimeout: document.getElementById('leastLoadTimeout').value.trim() || '30s',
    chainConfig: document.getElementById('chainConfig').value.trim()
  };
}

function collectProtocols() {
  return {
    vless: document.getElementById('protoVless').checked,
    trojan: document.getElementById('protoTrojan').checked
  };
}

function gen() {
  const token    = document.getElementById('uid').value.trim();
  const password = currentPassword();
  const raw_dom  = document.getElementById('wdom').value.trim();
  const dom      = raw_dom.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const raw      = document.getElementById('ips').value.trim();

  if (!token)    { toast(t('toast.noToken')); return; }
  if (!password) { toast(t('toast.noPassword')); return; }
  if (!dom)      { toast(t('toast.enterWorkerAddress')); return; }
  if (!raw)      { toast(t('toast.enterOneIp')); return; }

  const protocols = collectProtocols();
  if (!protocols.vless && !protocols.trojan) { toast(t('toast.selectOneProtocol')); return; }

  const settings  = collectSettings();
  const lanAuthError = validateLanAuth(settings.lanAccess, settings.lanUsername, settings.lanPassword);
  if (lanAuthError) { toast(t(lanAuthError)); return; }
  if (settings.customDomainUsed && !settings.customDomain) { toast(t('toast.enterCustomDomain')); return; }
  if (!settings.routingCountries.ir && !settings.routingCountries.cn && !settings.routingCountries.ru) {
    toast(t('toast.selectOneCountry'));
    return;
  }
  const durationRe = /^[1-9][0-9]*[ms]$/;
  const samplingRe = /^[1-9][0-9]*$/;
  if (!durationRe.test(settings.leastPingInterval) || !durationRe.test(settings.leastLoadInterval) || !durationRe.test(settings.leastLoadTimeout)) {
    toast(t('toast.observatoryDurationInvalid'));
    return;
  }
  if (!samplingRe.test(settings.leastLoadSampling)) {
    toast(t('toast.leastLoadSamplingInvalid'));
    return;
  }
  try {
    settings.parsedChain = parseChainConfig(settings.chainConfig);
  } catch (e) {
    toast(e.message);
    return;
  }
  const allIps    = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const ips       = settings.ipv6Enable ? allIps : allIps.filter(ip => !ip.includes(':'));

  if (!ips.length) { toast(t('toast.noIpAfterFilter')); return; }

  const tlsPorts = getChecked('ptls');
  const wsPorts  = getChecked('pws');
  const fp       = document.getElementById('fpSelect').value;

  if (!tlsPorts.length && !wsPorts.length) { toast(t('toast.selectOnePort')); return; }
  if (settings.customDomainUsed && settings.customDomain && !tlsPorts.length) { toast(t('toast.customDomainNeedsTls')); return; }

  const btn = document.getElementById('gb');
  btn.innerHTML = '<span class="sp"></span> ' + t('gen.building');
  btn.disabled = true;
  btn.classList.add('loading');

  setTimeout(() => {
    allC = [];
    let tlsCount = 0, wsCount = 0;

    ips.forEach((ip, ipIdx) => {
      const ipLabel = `IP${ipIdx + 1}`;
      tlsPorts.forEach(port => {
        if (protocols.vless) {
          const label = `VLESS-${ipLabel}-TLS${port}-${fp}`;
          allC.push({ cfg: buildConfig(token, dom, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `VLESS-TLS-${port}`, tagColor: 'var(--blue)' });
          tlsCount++;
        }
        if (protocols.trojan) {
          const label = `TROJAN-${ipLabel}-TLS${port}-${fp}`;
          allC.push({ cfg: buildTrojanConfig(password, dom, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `TROJAN-TLS-${port}`, tagColor: 'var(--green)' });
          tlsCount++;
        }
      });
      wsPorts.forEach(port => {
        if (protocols.vless) {
          const label = `VLESS-${ipLabel}-WS${port}`;
          allC.push({ cfg: buildConfig(token, dom, ip, port, 'none', '', settings.basePath, label, false, ''), tag: `VLESS-WS-${port}`, tagColor: 'var(--orange)' });
          wsCount++;
        }
        if (protocols.trojan) {
          const label = `TROJAN-${ipLabel}-WS${port}`;
          allC.push({ cfg: buildTrojanConfig(password, dom, ip, port, 'none', '', settings.basePath, label, false, ''), tag: `TROJAN-WS-${port}`, tagColor: 'var(--yellow)' });
          wsCount++;
        }
      });
    });

    if (settings.customDomainUsed && settings.customDomain) {
      ips.forEach((ip, ipIdx) => {
        const ipLabel = `IP${ipIdx + 1}`;
        tlsPorts.forEach(port => {
          if (protocols.vless) {
            const label = `VLESS-${ipLabel}-TLS${port}-${fp}-D`;
            allC.push({ cfg: buildConfig(token, settings.customDomain, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `VLESS-TLS-${port}-D`, tagColor: 'var(--blue)' });
            tlsCount++;
          }
          if (protocols.trojan) {
            const label = `TROJAN-${ipLabel}-TLS${port}-${fp}-D`;
            allC.push({ cfg: buildTrojanConfig(password, settings.customDomain, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `TROJAN-TLS-${port}-D`, tagColor: 'var(--green)' });
            tlsCount++;
          }
        });
      });
    }

    document.getElementById('lAll').innerHTML = allC.map((c, i) => row(c, i + 1)).join('');
    document.getElementById('sv').textContent  = tlsCount;
    document.getElementById('si').textContent  = wsCount;
    document.getElementById('sa').textContent  = allC.length;
    document.getElementById('cb2').textContent = allC.length;

    const jsonStr = buildJsonConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols);
    lastJsonStr = jsonStr;
    renderCodeBlock('jsonDisplay', jsonStr, highlightJsonLine);

    const singboxStr = buildSingboxConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols);
    lastSingboxStr = singboxStr;
    renderCodeBlock('singboxDisplay', singboxStr, highlightJsonLine);

    const clashStr = buildClashConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols);
    lastClashStr = clashStr;
    renderCodeBlock('clashDisplay', clashStr, highlightJsonLine);

    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

    ['sn1', 'sn2', 'sn3', 'sn4'].forEach(id => { document.getElementById(id).className = 'step done'; });
    btn.innerHTML = t('gen.built');
    btn.disabled = false;
    btn.classList.remove('loading');
    toast(t('toast.configsBuilt', { count: allC.length, tls: tlsCount, ws: wsCount }));
  }, 400);
}

function sanitizeFileNamePart(name) {
  return name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
}

function resolveFileNameSuffix() {
  const jsonNameVal = document.getElementById('jsonName').value.trim();
  const sanitized = jsonNameVal ? sanitizeFileNamePart(jsonNameVal) : '';
  if (sanitized) return sanitized;
  const echEnabled = document.getElementById('echEnable').checked;
  const fragEnabled = document.getElementById('fragEnable').checked;
  return echEnabled ? 'ECH' : (fragEnabled ? 'Fragment' : 'Normal');
}

function cpJson(e) {
  const btn = e.currentTarget;
  if (!lastJsonStr) return;
  navigator.clipboard.writeText(lastJsonStr).then(() => { toast(t('toast.jsonCopied')); flashCopied(btn); });
}

function dlJson() {
  if (!lastJsonStr) return;
  const fileName = `TCB_${resolveFileNameSuffix()}.json`;
  downloadFile(lastJsonStr, fileName, 'application/json');
  toast(t('toast.fileDownloaded', { name: fileName }));
}

function cpSingbox(e) {
  const btn = e.currentTarget;
  if (!lastSingboxStr) return;
  navigator.clipboard.writeText(lastSingboxStr).then(() => { toast(t('toast.singboxCopied')); flashCopied(btn); });
}

function dlSingbox() {
  if (!lastSingboxStr) return;
  const fileName = `TCB_Singbox_${resolveFileNameSuffix()}.json`;
  downloadFile(lastSingboxStr, fileName, 'application/json');
  toast(t('toast.fileDownloaded', { name: fileName }));
}

function cpClash(e) {
  const btn = e.currentTarget;
  if (!lastClashStr) return;
  navigator.clipboard.writeText(lastClashStr).then(() => { toast(t('toast.clashCopied')); flashCopied(btn); });
}

function dlClash() {
  if (!lastClashStr) return;
  const fileName = `TCB_Clash_${resolveFileNameSuffix()}.yaml`;
  downloadFile(lastClashStr, fileName, 'text/yaml');
  toast(t('toast.fileDownloaded', { name: fileName }));
}

function cpAll(e) {
  const btn = e.currentTarget;
  navigator.clipboard.writeText(allC.map(c => c.cfg).join('\n'))
    .then(() => { toast(t('toast.allCopied', { count: allC.length })); flashCopied(btn); });
}

function dlAll() {
  if (!allC.length) return;
  downloadFile(allC.map(c => c.cfg).join('\n'), 'TCB.txt', 'text/plain');
  toast(t('toast.allDownloaded', { count: allC.length }));
}

function wipeClipboardBestEffort() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('').catch(() => {});
    }
  } catch (e) {}
}

function silentWipeSensitiveState() {
  ['uid', 'tpw', 'wdom', 'ips', 'chainConfig', 'jsonName', 'lanUsername', 'lanPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['jsonDisplay', 'singboxDisplay', 'clashDisplay', 'workerDisplay', 'lAll'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  lastJsonStr = '';
  lastSingboxStr = '';
  lastClashStr = '';
  allC = [];
  wipeClipboardBestEffort();
}

function resetFormElement(el) {
  if (el.tagName === 'SELECT') {
    const def = Array.from(el.options).find(o => o.defaultSelected) || el.options[0];
    if (def) el.value = def.value;
  } else if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = el.defaultChecked;
  } else if (el.type !== 'file') {
    el.value = el.defaultValue;
  }
}

function resetAll() {
  const msg = getLang() === 'fa'
    ? 'تمام اطلاعات وارد شده پاک می‌شود و صفحه به حالت پیش‌فرض اولیه بازمی‌گردد. آیا مطمئن هستید؟'
    : 'All entered information will be cleared and the page will return to its initial default state. Are you sure?';
  if (!confirm(msg)) return;

  document.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id === 'importFileInput' || el.id === 'uid' || el.id === 'tpw') return;
    resetFormElement(el);
  });

  document.getElementById('tgSecret').dataset.base = '';
  delete document.getElementById('tgSecret').dataset.draft;
  toggleFrag();
  toggleFrag2();
  toggleEch();
  toggleLanAuth();
  switchDeployTab('worker');
  updateCustomDomainField();

  const tok = uuid4();
  const p = genPassword();
  document.getElementById('uid').value = tok;
  document.getElementById('tpw').value = p;
  renderWorker(tok, p, currentFallbackDomain());

  document.querySelectorAll('.sec-body-wrap.open').forEach(body => body.classList.remove('open'));
  document.querySelectorAll('.sec-hdr-toggle.open').forEach(hdr => hdr.classList.remove('open'));

  lastJsonStr = '';
  lastSingboxStr = '';
  lastClashStr = '';
  allC = [];

  ['jsonDisplay', 'singboxDisplay', 'clashDisplay', 'lAll'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  wipeClipboardBestEffort();

  document.getElementById('sn1').className = 'step active';
  document.getElementById('sn2').className = 'step';
  document.getElementById('sn3').className = 'step';
  document.getElementById('sn4').className = 'step';

  const results = document.getElementById('results');
  if (results.style.display === 'block') {
    results.classList.add('fading-out');
    setTimeout(() => {
      results.style.display = '';
      results.classList.remove('fading-out');
    }, 260);
  } else {
    results.style.display = '';
  }

  document.getElementById('gb').innerHTML = t('btn.generate');
  toast(t('toast.resetDone'));
}

function exportSettings() {
  const json = exportSettingsToString();
  downloadFile(json, 'TCB_Settings.json', 'application/json');
  toast(t('toast.settingsDownloaded'));
}

function importSettings(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (e) {
      toast(t('toast.invalidJsonFile'));
      return;
    }
    if (!isValidImportPayload(parsed)) {
      toast(t('toast.notTcbFile'));
      return;
    }
    if (!isCompatibleExport(parsed)) {
      toast(t('toast.oldSettingsFile'));
      return;
    }
    const restoredTarget = applyImportedSettings(parsed);
    switchDeployTab(restoredTarget);
    updateCustomDomainField();
    updateTelegramUi();
    toggleFrag();
    toggleFrag2();
    toggleEch();
    toggleLanAuth();
    renderWorker(document.getElementById('uid').value.trim(), currentPassword(), currentFallbackDomain());
    toast(t('toast.settingsImported'));
  };
  reader.onerror = () => toast(t('toast.fileReadError'));
  reader.readAsText(file);
}

function showQrModal(cfgText) {
  const box = document.getElementById('qrModalBox');
  try {
    const qr = generateQRMatrix(cfgText, 'M');
    box.innerHTML = qrMatrixToSvg(qr, 4);
  } catch (e) {
    toast(t('toast.qrTooLong'));
    return;
  }
  document.getElementById('qrModal').classList.add('show');
}

function hideQrModal() {
  document.getElementById('qrModal').classList.remove('show');
  document.getElementById('qrModalBox').innerHTML = '';
}

const STORAGE_THEME_KEY = 'tcb_theme';
const STORAGE_LANG_KEY = 'tcb_lang';

function readStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

function setTheme(mode, persist) {
  document.documentElement.classList.toggle('light', mode === 'light');
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.setAttribute('aria-pressed', mode === 'light' ? 'true' : 'false');
  if (persist) writeStoredValue(STORAGE_THEME_KEY, mode);
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  setTheme(isLight ? 'dark' : 'light', true);
}

function updateGenButtonText() {
  const btn = document.getElementById('gb');
  if (!btn) return;
  const resultsVisible = document.getElementById('results').style.display === 'block';
  btn.innerHTML = resultsVisible ? t('gen.built') : t('btn.generate');
}

function switchLang(lang, persist) {
  setLang(lang);
  applyI18n();
  document.getElementById('btn-lang-fa').classList.toggle('active', lang === 'fa');
  document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
  updateGenButtonText();
  updateTelegramUi();
  if (persist) writeStoredValue(STORAGE_LANG_KEY, lang);
}

document.addEventListener('DOMContentLoaded', () => {
  const storedTheme = readStoredValue(STORAGE_THEME_KEY);
  const storedLang = readStoredValue(STORAGE_LANG_KEY);
  switchLang(storedLang === 'en' ? 'en' : 'fa', false);
  setTheme(storedTheme === 'light' ? 'light' : 'dark', false);

  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-lang-fa').addEventListener('click', () => switchLang('fa', true));
  document.getElementById('btn-lang-en').addEventListener('click', () => switchLang('en', true));

  const tok = uuid4();
  const p = genPassword();
  document.getElementById('uid').value = tok;
  document.getElementById('tpw').value = p;
  renderWorker(tok, p, currentFallbackDomain());

  document.getElementById('uid').addEventListener('input', e => renderWorker(e.target.value.trim(), currentPassword(), currentFallbackDomain()));
  document.getElementById('tpw').addEventListener('input', e => renderWorker(document.getElementById('uid').value.trim(), e.target.value.trim(), currentFallbackDomain()));
  document.getElementById('fallbackDomain').addEventListener('input', () => renderWorker(document.getElementById('uid').value.trim(), currentPassword(), currentFallbackDomain()));
  document.getElementById('btn-cp-worker').addEventListener('click', cpWorker);
  document.getElementById('btn-dl-worker').addEventListener('click', dlWorker);
  document.getElementById('btn-dl-worker-zip').addEventListener('click', dlWorkerZip);
  document.getElementById('tab-worker').addEventListener('click', () => switchDeployTab('worker'));
  document.getElementById('tab-pages').addEventListener('click', () => switchDeployTab('pages'));
  document.getElementById('customDomainUsed').addEventListener('change', () => { updateCustomDomainField(); updateTelegramUi(); });
  document.getElementById('customDomainInput').addEventListener('input', updateTelegramUi);
  document.getElementById('wdom').addEventListener('input', updateTelegramUi);
  document.getElementById('uid').addEventListener('input', updateTelegramUi);
  document.getElementById('tpw').addEventListener('input', updateTelegramUi);
  document.getElementById('tgEnable').addEventListener('change', updateTelegramUi);
  document.getElementById('tgPadding').addEventListener('change', updateTelegramUi);
  document.getElementById('btn-mk-tg').addEventListener('click', mkTelegramSecret);
  document.getElementById('tgSecret').addEventListener('input', onTelegramSecretInput);
  const copySecret = copyFrom('tgSecret', 'toast.tgSecretCopied');
  document.getElementById('btn-cp-tg').addEventListener('click', (e) => { if (!telegramSecretIsDraft()) copySecret(e); });
  document.getElementById('btn-cp-tg-host').addEventListener('click', copyFrom('tgHost', 'toast.tgHostCopied'));
  document.getElementById('btn-cp-tg-link').addEventListener('click', copyFrom('tgLink', 'toast.tgLinkCopied'));
  document.getElementById('btn-dl-tg').addEventListener('click', dlTelegram);
  document.getElementById('btn-mk-token').addEventListener('click', mkToken);
  document.getElementById('btn-cp-token').addEventListener('click', cpToken);
  document.getElementById('btn-mk-pw').addEventListener('click', mkPassword);
  document.getElementById('btn-cp-pw').addEventListener('click', cpPassword);
  document.getElementById('fragEnable').addEventListener('change', toggleFrag);
  document.getElementById('frag2Enable').addEventListener('change', toggleFrag2);
  document.getElementById('echEnable').addEventListener('change', toggleEch);
  document.getElementById('lanAccess').addEventListener('change', toggleLanAuth);
  toggleLanAuth();
  document.getElementById('blockMalware').addEventListener('change', warnBlockRuleToggle);
  document.getElementById('blockPhishing').addEventListener('change', warnBlockRuleToggle);
  document.getElementById('blockCryptominers').addEventListener('change', warnBlockRuleToggle);
  document.getElementById('leastPingInterval').addEventListener('input', sanitizeDurationInput);
  document.getElementById('leastLoadInterval').addEventListener('input', sanitizeDurationInput);
  document.getElementById('leastLoadTimeout').addEventListener('input', sanitizeDurationInput);
  document.getElementById('leastLoadSampling').addEventListener('input', sanitizeIntegerInput);
  document.getElementById('btn-export-settings').addEventListener('click', exportSettings);
  document.getElementById('btn-import-settings').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    importSettings(file);
    e.target.value = '';
  });
  document.querySelectorAll('.sec-hdr-toggle').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const target = document.getElementById(hdr.dataset.target);
      if (!target) return;
      target.classList.toggle('open');
      hdr.classList.toggle('open');
    });
  });

  document.getElementById('gb').addEventListener('click', gen);
  document.getElementById('btn-reset-all').addEventListener('click', resetAll);
  document.getElementById('btn-cp-all').addEventListener('click', cpAll);
  document.getElementById('btn-dl-all').addEventListener('click', dlAll);
  document.getElementById('btn-cp-json').addEventListener('click', cpJson);
  document.getElementById('btn-dl-json').addEventListener('click', dlJson);
  document.getElementById('btn-cp-json-2').addEventListener('click', cpJson);
  document.getElementById('btn-dl-json-2').addEventListener('click', dlJson);
  document.getElementById('btn-cp-singbox').addEventListener('click', cpSingbox);
  document.getElementById('btn-dl-singbox').addEventListener('click', dlSingbox);
  document.getElementById('btn-cp-singbox-2').addEventListener('click', cpSingbox);
  document.getElementById('btn-dl-singbox-2').addEventListener('click', dlSingbox);
  document.getElementById('btn-cp-clash').addEventListener('click', cpClash);
  document.getElementById('btn-dl-clash').addEventListener('click', dlClash);
  document.getElementById('btn-cp-clash-2').addEventListener('click', cpClash);
  document.getElementById('btn-dl-clash-2').addEventListener('click', dlClash);

  document.getElementById('lAll').addEventListener('click', e => {
    const qrBtn = e.target.closest('.bqr');
    if (qrBtn) {
      showQrModal(decodeURIComponent(qrBtn.dataset.cfg));
      return;
    }
    const btn = e.target.closest('.bcp');
    if (!btn) return;
    navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cfg)).then(() => {
      flashCopied(btn);
    });
  });

  document.getElementById('qrModalClose').addEventListener('click', hideQrModal);
  document.getElementById('qrModal').addEventListener('click', e => {
    if (e.target.id === 'qrModal') hideQrModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideQrModal();
  });
});

window.addEventListener('pagehide', silentWipeSensitiveState);