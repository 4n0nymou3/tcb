import { t } from './i18n.js';

let toastHideTimer = null;
let toastResetTimer = null;

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastHideTimer);
  clearTimeout(toastResetTimer);
  el.classList.remove('show');
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.textContent = msg;
  el.classList.add('is-visible');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });
  toastHideTimer = setTimeout(() => {
    el.classList.remove('show');
    toastResetTimer = setTimeout(() => el.classList.remove('is-visible'), 400);
  }, 2800);
}

export function flashCopied(btn) {
  if (!btn) return;
  if (btn.dataset.flashing === '1') return;
  const original = btn.innerHTML;
  btn.dataset.flashing = '1';
  btn.innerHTML = '<svg class="chk-ico" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>';
  btn.classList.add('copied-pop', 'is-copied');
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove('copied-pop', 'is-copied');
    btn.dataset.flashing = '0';
  }, 1500);
}

export function getChecked(cls) {
  return [...document.querySelectorAll('.' + cls + ':checked')].map(el => el.value);
}

export function row(c, n) {
  const s = encodeURIComponent(c.cfg);
  const safeCfg = escapeHtml(c.cfg);
  const color = c.tagColor || 'var(--blue)';
  return `<div class="cfi" style="border-right-color:${color}">
    <span class="cn">${String(n).padStart(2, '0')}</span>
    <span class="ctg" style="color:${color};background:${color}1a">${c.tag}</span>
    <span class="ctx" title="${safeCfg}">${safeCfg}</span>
    <button class="bqr" data-cfg="${s}" title="${t('title.showQr')}" aria-label="${t('title.showQr')}">▦</button>
    <button class="bcp" data-cfg="${s}">${t('btn.copyPlain')}</button>
  </div>`;
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightTokens(line, regex, render) {
  let out = '';
  let last = 0;
  line.replace(regex, function () {
    const args = Array.prototype.slice.call(arguments);
    const offset = args[args.length - 2];
    const match = args[0];
    out += escapeHtml(line.slice(last, offset)) + render.apply(null, args.slice(0, args.length - 2));
    last = offset + match.length;
    return match;
  });
  return out + escapeHtml(line.slice(last));
}

export function highlightJsonLine(line) {
  return highlightTokens(
    line,
    /("(?:\\.|[^"\\])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?)/g,
    function (match) {
      let cls = 'jn';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'jk' : 'js';
      } else if (/^(true|false)$/.test(match)) {
        cls = 'jb';
      } else if (/^null$/.test(match)) {
        cls = 'jz';
      }
      return '<span class="' + cls + '">' + escapeHtml(match) + '</span>';
    }
  );
}

export function highlightJsLine(line) {
  return highlightTokens(
    line,
    /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:import|from|const|let|async|await|return|if|else|for|of|new|try|catch|null|true|false|export|default|function)\b|\b\d+\b)/g,
    function (match) {
      if (/^['"]/.test(match)) return '<span class="s">' + escapeHtml(match) + '</span>';
      if (/^\d/.test(match)) return '<span class="n">' + escapeHtml(match) + '</span>';
      return '<span class="k">' + escapeHtml(match) + '</span>';
    }
  );
}

export function renderCodeBlock(elId, text, lineHighlighter) {
  const el = document.getElementById(elId);
  if (!el) return;
  const raw = (text || '').replace(/\n$/, '');
  const lines = raw.split('\n');
  el.style.setProperty('--gutter-digits', String(lines.length).length);
  el.innerHTML = lines.map(function (line, i) {
    const content = lineHighlighter ? (lineHighlighter(line) || ' ') : (escapeHtml(line) || ' ');
    return '<div class="code-line"><span class="code-gutter">' + (i + 1) +
      '</span><span class="code-content">' + content + '</span></div>';
  }).join('');
}