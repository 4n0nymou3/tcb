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
    <button class="bqr" data-cfg="${s}" title="نمایش QR Code">▦</button>
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

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightJsonLine(line) {
  const escaped = escapeHtml(line);
  return escaped.replace(
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
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
}

function highlightYamlRest(text) {
  if (!text) return text;
  return text.replace(
    /(#.*$)|("(?:\\.|[^"\\])*")|(\btrue\b|\bfalse\b|\bnull\b)|(-?\b\d+(?:\.\d+)?\b)/g,
    function (match, comment, str, bool, num) {
      if (comment) return '<span class="jc">' + comment + '</span>';
      if (str) return '<span class="js">' + str + '</span>';
      if (bool) return '<span class="jb">' + bool + '</span>';
      if (num) return '<span class="jn">' + num + '</span>';
      return match;
    }
  );
}

export function highlightYamlLine(line) {
  const escaped = escapeHtml(line);
  const kv = escaped.match(/^(\s*(?:-\s+)?)([A-Za-z0-9_.-]+)(:)(.*)$/);
  if (kv) {
    return kv[1] + '<span class="jk">' + kv[2] + kv[3] + '</span>' + highlightYamlRest(kv[4]);
  }
  return highlightYamlRest(escaped);
}

export function highlightJsLine(line) {
  const escaped = escapeHtml(line);
  return escaped.replace(
    /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:import|from|const|let|async|await|return|if|else|for|of|new|try|catch|null|true|false|export|default|function)\b|\b\d+\b)/g,
    function (match) {
      if (/^['"]/.test(match)) return '<span class="s">' + match + '</span>';
      if (/^\d/.test(match)) return '<span class="n">' + match + '</span>';
      return '<span class="k">' + match + '</span>';
    }
  );
}

export function renderCodeBlock(elId, text, lineHighlighter) {
  const el = document.getElementById(elId);
  if (!el) return;
  const raw = (text || '').replace(/\n$/, '');
  const lines = raw.split('\n');
  el.innerHTML = lines.map(function (line, i) {
    const content = lineHighlighter ? (lineHighlighter(line) || ' ') : (escapeHtml(line) || ' ');
    return '<div class="code-line"><span class="code-gutter">' + (i + 1) +
      '</span><span class="code-content">' + content + '</span></div>';
  }).join('');
}