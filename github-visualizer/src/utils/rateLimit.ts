import type { RateLimitInfo } from '@/types/index.ts';

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '0', 10);
  const limit = parseInt(headers.get('X-RateLimit-Limit') || '60', 10);
  const resetTimestamp = parseInt(headers.get('X-RateLimit-Reset') || '0', 10);

  return {
    remaining,
    limit,
    reset: resetTimestamp ? new Date(resetTimestamp * 1000) : null,
  };
}
