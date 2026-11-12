// Simple in-memory token bucket, keyed by client IP. Good enough for a
// single-container Coolify deployment; per-instance by design.

/**
 * @param {{ capacity?: number, refillPerMinute?: number, now?: () => number }} options
 *   capacity         — burst size (default 60)
 *   refillPerMinute  — tokens added per minute (default 60, i.e. 1/sec)
 *   now              — clock override for tests
 */
export function createRateLimiter({
  capacity = 60,
  refillPerMinute = 60,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();

  function maybePrune(currentTime) {
    if (buckets.size <= 5000) return;
    const staleAfter = (capacity / refillPerMinute) * 4 * 60_000;
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.updated > staleAfter) buckets.delete(key);
    }
  }

  return {
    /**
     * Try to consume one token for `key`.
     * @returns {{ ok: boolean, retryAfter: number }} retryAfter is in seconds.
     */
    check(key) {
      const time = now();
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, updated: time };
        buckets.set(key, bucket);
      } else {
        const elapsed = time - bucket.updated;
        // Multiply before dividing so common intervals stay exact in float math.
        bucket.tokens = Math.min(
          capacity,
          bucket.tokens + (elapsed * refillPerMinute) / 60_000,
        );
        bucket.updated = time;
      }

      if (bucket.tokens < 1) {
        maybePrune(time);
        const retryAfter = Math.max(
          1,
          Math.ceil(((1 - bucket.tokens) / refillPerMinute) * 60),
        );
        return { ok: false, retryAfter };
      }

      bucket.tokens -= 1;
      maybePrune(time);
      return { ok: true, retryAfter: 0 };
    },
  };
}
