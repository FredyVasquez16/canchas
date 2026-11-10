/**
 * S42: a fixed-window limiter over a Map, counted with an injected clock so the tests are
 * deterministic. The project keeps its policy numbers in `config.ts` and its tests drive
 * `now`, which is why this is a few lines here instead of a new dependency.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds the caller should wait before trying again; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
  /** Forgets a key, so a legitimate success cannot be punished by earlier attempts. */
  reset(key: string): void;
  /** Live keys; expired ones are dropped on the way, so the map cannot grow forever. */
  size(): number;
}

interface Window {
  count: number;
  resetAt: number;
}

export function createRateLimiter(deps: { now: () => number }): RateLimiter {
  const windows = new Map<string, Window>();

  function sweep(now: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) {
        windows.delete(key);
      }
    }
  }

  return {
    check(key, limit, windowMs) {
      const now = deps.now();
      const current = windows.get(key);

      if (!current || current.resetAt <= now) {
        // A new window starts with this attempt. Creating one is the moment to drop the
        // keys that already expired, so memory follows traffic instead of history.
        sweep(now);
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
      }

      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },

    size() {
      sweep(deps.now());
      return windows.size;
    },

    reset(key) {
      windows.delete(key);
    },
  };
}
