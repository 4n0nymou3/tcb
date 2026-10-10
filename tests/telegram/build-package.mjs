import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv[2] || 'worker';
const outDir = process.argv[3];
const hostname = process.argv[4] || 'tcb-test.example.workers.dev';
const workerName = process.argv[5] || 'tcb-test';

globalThis.fetch = async (url) => {
  const file = path.join(root, url);
  if (!fs.existsSync(file)) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => fs.readFileSync(file, 'utf8') };
};

const { buildTelegramPackages } = await import(path.join(root, 'js/telegram-webproxy.js'));
const packages = await buildTelegramPackages({
  target,
  token: '11111111-2222-4333-8444-555555555555',
  password: 'trojan-test-password',
  fallbackDomain: '',
  hostname,
  workerName,
  lang: 'fa'
});
for (const pkg of packages) {
  const dir = path.join(outDir, pkg.filename.replace(/\.zip$/, ''));
  for (const file of pkg.files) {
    const dest = path.join(dir, file.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content);
  }
  console.log('wrote', dir, pkg.files.length, 'files');
}
