import crypto from 'node:crypto';

export function reverseBytes(buf) {
  return Buffer.from(buf).reverse();
}

export function nodeStream(key, iv) {
  const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(key), Buffer.from(iv));
  return (data) => new Uint8Array(cipher.update(Buffer.from(data)));
}

export function clientCrypto({ readKey, readIv, writeKey, writeIv }) {
  const encrypt = nodeStream(readKey, readIv);
  encrypt(new Uint8Array(64));
  const decrypt = nodeStream(writeKey, writeIv);
  return { encrypt, decrypt };
}

export function parseDcHeader(header) {
  const buf = Buffer.from(header);
  const key = buf.subarray(8, 40);
  const iv = buf.subarray(40, 56);
  const recvDecrypt = crypto.createDecipheriv('aes-256-ctr', key, iv);
  const plain = recvDecrypt.update(buf);
  const tag = plain.readUInt32BE(56);
  const dc = plain.readInt16LE(60);
  const reversed = reverseBytes(buf.subarray(8, 56));
  const sendCipher = crypto.createCipheriv('aes-256-ctr', reversed.subarray(0, 32), reversed.subarray(32, 48));
  const first = buf.readUInt32LE(0);
  const reserved = [0x44414548, 0x54534f50, 0x20544547, 0x4954504f, 0x02010316, 0xdddddddd, 0xeeeeeeee];
  const shapeOk = buf[0] !== 0xef && !reserved.includes(first) && (buf[4] | buf[5] | buf[6] | buf[7]) !== 0;
  return {
    tag,
    dc,
    shapeOk,
    tagOk: [0xefefefef, 0xeeeeeeee, 0xdddddddd].includes(tag),
    decrypt: (data) => new Uint8Array(recvDecrypt.update(Buffer.from(data))),
    encrypt: (data) => new Uint8Array(sendCipher.update(Buffer.from(data)))
  };
}
