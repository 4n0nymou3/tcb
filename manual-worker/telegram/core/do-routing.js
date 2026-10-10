async function doSeedFromBootstrapNonce(bootstrapNonceBytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bootstrapNonceBytes);
  return new Uint8Array(digest).slice(0, 16);
}
function doNameFromSeed(seedBytes) {
  return bytesToHex(seedBytes);
}
function bytesToHex(bytes) {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
export {
  doNameFromSeed,
  doSeedFromBootstrapNonce
};
