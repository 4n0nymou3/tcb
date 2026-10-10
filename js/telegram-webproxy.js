import { createZip } from './zip-writer.js';
import { buildWorker } from './worker-builder.js';

const COMPAT_DATE = '2026-09-23';
const SOURCE_DIR = 'manual-worker/telegram/';

const SHARED_FILES = [
  'session-do.js',
  'tcp-adapter.js',
  'telegram-router.js',
  'core/bridge.js',
  'core/bridge-page.js',
  'core/capability.js',
  'core/dc-config.js',
  'core/do-routing.js',
  'core/limits.js',
  'core/obfuscated2.js',
  'core/protocol-v3.js',
  'core/session.js',
  'core/telegram-config.js',
  'core/token.js'
];

const PAGES_ROUTER = `
const __tcb = __TCB_DEFAULT__;
function __telegramCandidate(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.has('bridge')) return true;
  if (url.pathname === '/api/v1/session') return request.method === 'POST' || request.method === 'DELETE';
  if (url.pathname === '/api/v1/diag') return request.method === 'POST';
  if (url.pathname === '/api/v1/ws') return (request.headers.get('upgrade') || '').toLowerCase() === 'websocket';
  return false;
}
export default {
  async fetch(request, env, ctx) {
    if (env.TELEGRAM_WORKER && __telegramCandidate(request)) {
      const forwarded = await env.TELEGRAM_WORKER.fetch(request.method === 'POST' ? request.clone() : request);
      if (forwarded.headers.get('x-tcb-passthrough') !== '1') return forwarded;
    }
    return __tcb.fetch(request, env, ctx);
  }
};
`;

export function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateTelegramBase() {
  return randomHex(16);
}

export function composeTelegramSecret(baseHex, randomPadding) {
  return (randomPadding ? 'dd' : '') + String(baseHex || '').toLowerCase();
}

export function isValidTelegramBase(value) {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

export function normalizeTelegramHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

export function isValidTelegramHostname(value) {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);
}

export function telegramWorkerName(platformDomain, fallbackName) {
  const domain = normalizeTelegramHostname(platformDomain);
  const first = domain.split('.')[0] || '';
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(first) && /\.(workers|pages)\.dev$/.test(domain)) return first;
  return fallbackName;
}

export function buildTelegramLink(hostname, secret) {
  return `https://t.me/webproxy?server=${encodeURIComponent(hostname)}&secret=${encodeURIComponent(secret)}`;
}

export function buildTelegramTgLink(hostname, secret) {
  return `tg://webproxy?server=${encodeURIComponent(hostname)}&secret=${encodeURIComponent(secret)}`;
}

function wranglerToml(name, hostname) {
  return [
    `name = "${name}"`,
    'main = "index.js"',
    `compatibility_date = "${COMPAT_DATE}"`,
    '',
    '[vars]',
    `TELEGRAM_HOSTNAME = "${hostname}"`,
    '',
    '[[durable_objects.bindings]]',
    'name = "SESSION_DO"',
    'class_name = "SessionDO"',
    '',
    '[[migrations]]',
    'tag = "v1"',
    'new_sqlite_classes = ["SessionDO"]',
    ''
  ].join('\n');
}

async function fetchSource(path, fetchText) {
  const text = await fetchText(SOURCE_DIR + path);
  if (typeof text !== 'string' || !text.length) throw new Error('missing telegram source: ' + path);
  return text;
}

const defaultFetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed: ' + url);
  return res.text();
};

export function buildReadme(lang, opts) {
  const { target, hostname, workerName, companionName } = opts;
  if (lang === 'en') {
    const common = [
      'TCB - Telegram WEB Proxy package',
      '================================',
      '',
      'Hostname used for Telegram: ' + hostname,
      'This exact hostname must be typed into Telegram (no https://, no port).',
      '',
      'Cloudflare settings for this package',
      '- TELEGRAM_SECRET (Secret, required): the secret shown in TCB. Never commit it to GitHub.',
      '- TELEGRAM_HOSTNAME (plain variable, already set in wrangler.toml): must equal the hostname printed above.',
      '- TELEGRAM_DIAG (plain variable, optional): set it to 1 only while troubleshooting; remove it afterwards. It logs a few sanitized connection-stage events and no traffic content.',
      'Random padding is chosen in the TCB panel: it adds the dd prefix to the secret, so after changing it you must update TELEGRAM_SECRET in Cloudflare and the secret in Telegram.',
      ''
    ];
    if (target === 'pages') {
      return common.concat([
        'STEP 1 - deploy the companion Worker (it owns the Durable Object)',
        '1. Create a new private GitHub repository and upload every file inside telegram-worker.zip to its root.',
        '2. Cloudflare Dashboard > Workers & Pages > Create > Import a repository, choose that repository.',
        '3. The project name must be exactly: ' + companionName,
        '4. After the first deploy: Worker > Settings > Variables and Secrets > Add > type Secret, name TELEGRAM_SECRET, value = the secret shown in TCB.',
        '',
        'STEP 2 - upload the Pages project',
        '1. Upload pages-worker.zip (it contains _worker.js) to your Pages project, as before.',
        '2. Pages project > Settings > Bindings > Add > Service binding: variable name TELEGRAM_WORKER, service ' + companionName + '.',
        '3. Redeploy the Pages project once so the binding becomes active.',
        '',
        'STEP 3 - Telegram',
        'Add the proxy from the TCB page link, or type server = ' + hostname + ' and the secret in Telegram.',
        '',
        'Notes',
        '- Never commit the secret to GitHub. It is only stored as a Cloudflare secret.',
        '- If TELEGRAM_SECRET is missing the Telegram feature stays off and your VLESS/Trojan setup keeps working.',
        '- Free plan limits apply to Durable Objects and Workers requests.',
        ''
      ]).join('\n');
    }
    return common.concat([
      'STEP 1 - GitHub',
      '1. Create a new private GitHub repository.',
      '2. Upload every file of this ZIP to the repository root (Add file > Upload files).',
      '',
      'STEP 2 - Cloudflare',
      '1. Workers & Pages > open your Worker named ' + workerName + ' > Settings > Builds > Connect (or Create > Import a repository).',
      '2. Choose the repository. The Worker name must match the name in wrangler.toml: ' + workerName,
      '3. Let it deploy.',
      '4. Worker > Settings > Variables and Secrets > Add > type Secret, name TELEGRAM_SECRET, value = the secret shown in TCB.',
      '',
      'STEP 3 - Telegram',
      'Add the proxy from the TCB page link, or type server = ' + hostname + ' and the secret in Telegram.',
      '',
      'Notes',
      '- Never commit the secret to GitHub. It is only stored as a Cloudflare secret.',
      '- If TELEGRAM_SECRET is missing the Telegram feature stays off and your VLESS/Trojan setup keeps working.',
      '- The paths /api/v1/session and /api/v1/ws and the query ?bridge= on / are reserved for Telegram.',
      '- Free plan limits apply to Durable Objects and Workers requests.',
      ''
    ]).join('\n');
  }
  const common = [
    'TCB - بسته‌ی Telegram WEB Proxy',
    '================================',
    '',
    'Hostname برای تلگرام: ' + hostname,
    'دقیقاً همین hostname را در تلگرام وارد کن (بدون https:// و بدون پورت).',
    '',
    'تنظیمات Cloudflare برای این بسته',
    '- TELEGRAM_SECRET (از نوع Secret، الزامی): همان secret نمایش‌داده‌شده در TCB. هرگز آن را در GitHub commit نکن.',
    '- TELEGRAM_HOSTNAME (متغیر معمولی، از قبل در wrangler.toml تنظیم شده): باید با hostname بالا یکی باشد.',
    '- TELEGRAM_DIAG (متغیر معمولی، اختیاری): فقط هنگام عیب‌یابی مقدار 1 بگذار و بعد از آن حذفش کن. فقط چند رویداد پاک‌سازی‌شده‌ی مرحله‌ی اتصال را لاگ می‌کند و محتوای ترافیک را نه.',
    'Random padding در پنل TCB انتخاب می‌شود و پیشوند dd را به secret اضافه می‌کند؛ پس از تغییر آن باید TELEGRAM_SECRET در Cloudflare و secret در تلگرام هم عوض شود.',
    ''
  ];
  if (target === 'pages') {
    return common.concat([
      'مرحله ۱ - استقرار Worker همراه (Durable Object داخل آن است)',
      '۱. یک مخزن خصوصی جدید در GitHub بساز و همه‌ی فایل‌های داخل telegram-worker.zip را در ریشه‌ی آن آپلود کن.',
      '۲. Cloudflare > Workers & Pages > Create > Import a repository و همان مخزن را انتخاب کن.',
      '۳. اسم پروژه باید دقیقاً این باشد: ' + companionName,
      '۴. بعد از اولین استقرار: Worker > Settings > Variables and Secrets > Add، نوع Secret، اسم TELEGRAM_SECRET و مقدار = secret نمایش‌داده‌شده در TCB.',
      '',
      'مرحله ۲ - پروژه‌ی Pages',
      '۱. فایل pages-worker.zip (حاوی _worker.js) را مثل قبل در پروژه‌ی Pages آپلود کن.',
      '۲. Pages > Settings > Bindings > Add > Service binding با نام متغیر TELEGRAM_WORKER و سرویس ' + companionName + '.',
      '۳. یک بار Pages را دوباره استقرار بده تا binding فعال شود.',
      '',
      'مرحله ۳ - تلگرام',
      'پروکسی را با لینک صفحه‌ی TCB اضافه کن، یا server = ' + hostname + ' و secret را دستی وارد کن.',
      '',
      'نکته‌ها',
      '- secret را هرگز در GitHub commit نکن. فقط به‌عنوان Secret در Cloudflare نگهداری می‌شود.',
      '- اگر TELEGRAM_SECRET تنظیم نشده باشد قابلیت تلگرام خاموش می‌ماند و VLESS/Trojan شما بدون تغییر کار می‌کند.',
      '- محدودیت‌های پلن رایگان برای Durable Object و درخواست‌های Workers اعمال می‌شود.',
      ''
    ]).join('\n');
  }
  return common.concat([
    'مرحله ۱ - GitHub',
    '۱. یک مخزن خصوصی جدید در GitHub بساز.',
    '۲. همه‌ی فایل‌های این ZIP را در ریشه‌ی مخزن آپلود کن (Add file > Upload files).',
    '',
    'مرحله ۲ - Cloudflare',
    '۱. Workers & Pages > Worker با نام ' + workerName + ' را باز کن > Settings > Builds > Connect (یا Create > Import a repository).',
    '۲. مخزن را انتخاب کن. اسم Worker باید با نام داخل wrangler.toml یکی باشد: ' + workerName,
    '۳. صبر کن استقرار کامل شود.',
    '۴. Worker > Settings > Variables and Secrets > Add، نوع Secret، اسم TELEGRAM_SECRET و مقدار = secret نمایش‌داده‌شده در TCB.',
    '',
    'مرحله ۳ - تلگرام',
    'پروکسی را با لینک صفحه‌ی TCB اضافه کن، یا server = ' + hostname + ' و secret را دستی وارد کن.',
    '',
    'نکته‌ها',
    '- secret را هرگز در GitHub commit نکن. فقط به‌عنوان Secret در Cloudflare نگهداری می‌شود.',
    '- اگر TELEGRAM_SECRET تنظیم نشده باشد قابلیت تلگرام خاموش می‌ماند و VLESS/Trojan شما بدون تغییر کار می‌کند.',
    '- مسیرهای /api/v1/session و /api/v1/ws و پارامتر ?bridge= روی / برای تلگرام رزرو هستند.',
    '- محدودیت‌های پلن رایگان برای Durable Object و درخواست‌های Workers اعمال می‌شود.',
    ''
  ]).join('\n');
}

export async function buildTelegramPackages(opts, fetchText = defaultFetchText) {
  const { target, token, password, fallbackDomain, hostname, workerName, lang } = opts;
  const companionName = workerName + '-telegram';
  const readme = buildReadme(lang || 'fa', { target, hostname, workerName, companionName });
  const shared = [];
  for (const path of SHARED_FILES) shared.push({ name: path, content: await fetchSource(path, fetchText) });
  const tcbCode = await buildWorker(token, password, fallbackDomain);

  if (target === 'pages') {
    const companionIndex = await fetchSource('index-companion.js', fetchText);
    const pagesWorker = tcbCode.replace('export default{', 'const __tcbDefault={').replace(/\n?$/, '\n') + PAGES_ROUTER.replace('__TCB_DEFAULT__', '__tcbDefault');
    return [
      { filename: 'pages-worker.zip', files: [{ name: '_worker.js', content: pagesWorker }] },
      {
        filename: 'telegram-worker.zip',
        files: [
          { name: 'index.js', content: companionIndex },
          ...shared,
          { name: 'wrangler.toml', content: wranglerToml(companionName, hostname) },
          { name: 'README-TELEGRAM.txt', content: readme }
        ]
      }
    ];
  }

  const indexJs = await fetchSource('index.js', fetchText);
  return [
    {
      filename: 'telegram-worker.zip',
      files: [
        { name: 'index.js', content: indexJs },
        { name: 'tcb-worker.js', content: tcbCode },
        ...shared,
        { name: 'wrangler.toml', content: wranglerToml(workerName, hostname) },
        { name: 'README-TELEGRAM.txt', content: readme }
      ]
    }
  ];
}

export function zipPackage(pkg) {
  return createZip(pkg.files);
}