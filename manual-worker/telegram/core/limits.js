const GLOBAL_LIMITS = Object.freeze({
  httpHeaderBytes: 16 * 1024,
  binaryRequestBodyBytes: 2 * 1024 * 1024,
  framePayloadBytes: 1 * 1024 * 1024,
  relayDataChunkBytes: 64 * 1024,
  carrierBatchTargetBytes: 2 * 1024 * 1024,
  initialStreamWindowBytes: 4 * 1024 * 1024,
  logicalStreamsPerSession: 128,
  recentlyClosedStreamIdsPerSession: 4096,
  pendingBytesPerSession: 32 * 1024 * 1024,
  pendingBytesProcessWide: 512 * 1024 * 1024,
  pendingItemsPerSession: 16384,
  pendingItemsProcessWide: 262144,
  queueAllocationChargeBytes: 256,
  sessionsPerSourceIp: 0,

  liveSessionsProcessWide: 128,
  liveStreamsProcessWide: 4096,
  backendDialsInFlight: 256,
  newSessionsPerMinute: 600,
  newSessionsBurst: 128,
  newStreamsPerMinute: 6e3,
  newStreamsBurst: 512,
  unusedBootstrapsPerSourceIp: 0,

  bootstrapEntriesProcessWide: 512,
  newBootstrapsPerMinute: 1200,
  newBootstrapsBurst: 256,
  backendDialTimeoutMs: 5e3,
  longPollHoldMs: 25e3,
  carrierReconnectGraceMs: 2 * 60 * 1e3,
  bootstrapLifetimeMs: 2 * 60 * 1e3
});
function resolveProfileLimits(profileOverrides = {}) {
  const resolved = { ...GLOBAL_LIMITS };
  for (const [k, v] of Object.entries(profileOverrides)) {
    if (!(k in GLOBAL_LIMITS)) throw new Error(`unknown limit key: ${k}`);
    if (v > GLOBAL_LIMITS[k]) {
      throw new Error(`profile override for ${k} (${v}) exceeds global ceiling (${GLOBAL_LIMITS[k]}) - overrides may only lower a limit`);
    }
    resolved[k] = v;
  }
  return Object.freeze(resolved);
}
export {
  GLOBAL_LIMITS,
  resolveProfileLimits
};
