import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "../../server/rate-limit.js";

function makeClock(start = 0) {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

describe("createRateLimiter", () => {
  it("allows a full burst up to capacity, then blocks", () => {
    const clock = makeClock();
    const limiter = createRateLimiter({
      capacity: 3,
      refillPerMinute: 3,
      now: clock.now,
    });

    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(true);
    const blocked = limiter.check("guest");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("refills tokens as time passes", () => {
    const clock = makeClock();
    const limiter = createRateLimiter({
      capacity: 2,
      refillPerMinute: 3,
      now: clock.now,
    });

    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(false);

    clock.advance(20_000); // 3/min × 20s = exactly one token back
    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(false);
  });

  it("caps the bucket at capacity after idle time", () => {
    const clock = makeClock();
    const limiter = createRateLimiter({
      capacity: 3,
      refillPerMinute: 3,
      now: clock.now,
    });

    limiter.check("guest");
    clock.advance(10 * 60_000); // ten minutes idle
    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(true);
    expect(limiter.check("guest").ok).toBe(true); // capped at 3, not 3+refill
    expect(limiter.check("guest").ok).toBe(false);
  });

  it("isolates buckets per key", () => {
    const clock = makeClock();
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerMinute: 1,
      now: clock.now,
    });

    expect(limiter.check("alice").ok).toBe(true);
    expect(limiter.check("alice").ok).toBe(false);
    expect(limiter.check("bob").ok).toBe(true); // separate bucket
  });

  it("reports retryAfter in seconds that shrink as tokens refill", () => {
    const clock = makeClock();
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerMinute: 3,
      now: clock.now,
    });

    limiter.check("guest");
    const blockedAtOnce = limiter.check("guest");
    expect(blockedAtOnce.retryAfter).toBe(20); // 60s / 3 per minute

    clock.advance(10_000); // half a token later
    const blockedLater = limiter.check("guest");
    expect(blockedLater.retryAfter).toBe(10);
  });
});
