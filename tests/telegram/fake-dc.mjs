import net from 'node:net';
import fs from 'node:fs';
import { parseDcHeader } from './tg-crypto.mjs';

const port = Number(process.argv[2] || 21301);
const logPath = process.env.TG_DC_LOG || '';
const record = (entry) => { if (logPath) fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); };

const server = net.createServer((sock) => {
  sock.on('error', () => {});
  let buffer = Buffer.alloc(0);
  let session = null;
  sock.on('data', (chunk) => {
    if (!session) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 64) return;
      const parsed = parseDcHeader(buffer.subarray(0, 64));
      if (!parsed.shapeOk || !parsed.tagOk) {
        record({ evt: 'rejected', tag: parsed.tag.toString(16), dc: parsed.dc });
        sock.destroy();
        return;
      }
      record({ evt: 'accepted', tag: parsed.tag.toString(16), dc: parsed.dc });
      session = parsed;
      chunk = buffer.subarray(64);
      buffer = Buffer.alloc(0);
      if (!chunk.length) return;
    }
    const plain = Buffer.from(session.decrypt(chunk));
    const out = Buffer.alloc(plain.length);
    for (let i = 0; i < plain.length; i++) out[i] = plain[i] ^ 0xa5;
    const a = Math.max(1, Math.floor(out.length / 3));
    const pieces = [out.subarray(0, a), out.subarray(a, a * 2 + 1), out.subarray(a * 2 + 1)].filter((p) => p.length);
    for (const piece of pieces) sock.write(Buffer.from(session.encrypt(piece)));
  });
});
server.listen(port, () => console.log('fake dc on', port));
