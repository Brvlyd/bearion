import { expect, test } from '@playwright/test'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

test('allows up to the limit, then blocks with a retry hint', () => {
  const key = `test:${Math.random()}`
  const options = { key, limit: 3, windowMs: 60_000 }

  expect(checkRateLimit(options).remaining).toBe(2)
  expect(checkRateLimit(options).remaining).toBe(1)
  expect(checkRateLimit(options).allowed).toBe(true)

  const blocked = checkRateLimit(options)
  expect(blocked.allowed).toBe(false)
  expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
})

test('buckets are independent per key', () => {
  const a = { key: `a:${Math.random()}`, limit: 1, windowMs: 60_000 }
  const b = { key: `b:${Math.random()}`, limit: 1, windowMs: 60_000 }

  expect(checkRateLimit(a).allowed).toBe(true)
  expect(checkRateLimit(a).allowed).toBe(false)
  expect(checkRateLimit(b).allowed).toBe(true)
})

test('reads the first forwarded client IP', () => {
  const request = new Request('http://localhost', {
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
  })
  expect(getClientIp(request)).toBe('203.0.113.7')
  expect(getClientIp(new Request('http://localhost'))).toBe('unknown')
})
