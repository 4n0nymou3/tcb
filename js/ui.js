export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

export function getChecked(cls) {
  return [...document.querySelectorAll('.' + cls + ':checked')].map(el => el.value);
}

export function row(c, n) {
  const s = encodeURIComponent(c.cfg);
  const color = c.tagColor || 'var(--blue)';
  return `<div class="cfi" style="border-right-color:${color}">
    <span class="cn">${String(n).padStart(2, '0')}</span>
    <span class="ctg" style="color:${color};background:${color}1a">${c.tag}</span>
    <span class="ctx" title="${c.cfg}">${c.cfg}</span>
    <button class="bcp" data-cfg="${s}">کپی</button>
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