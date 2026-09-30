import { expect, test } from '@playwright/test'
import { getExpectedUsdAmount, isCaptureVerified } from '@/lib/paypal-settlement'
import type { PayPalCaptureResult } from '@/lib/paypal'

const capture = (overrides: Partial<PayPalCaptureResult> = {}): PayPalCaptureResult => ({
  status: 'COMPLETED',
  customId: 'BRN-001',
  capturedAmount: '10.00',
  capturedCurrency: 'USD',
  captureId: 'CAP-1',
  raw: {},
  ...overrides,
})

test.describe('getExpectedUsdAmount', () => {
  test('derives USD from the order total and its locked rate', () => {
    expect(getExpectedUsdAmount({ total: 160_000, fx_rate_idr_usd: 16_000 })).toBe(10)
  })

  test('accepts numeric strings, as Postgres numerics arrive', () => {
    expect(getExpectedUsdAmount({ total: '250000', fx_rate_idr_usd: '16000' })).toBe(15.63)
  })

  test('is null without a locked rate, so the capture cannot be verified', () => {
    expect(getExpectedUsdAmount({ total: 160_000, fx_rate_idr_usd: null })).toBeNull()
    expect(getExpectedUsdAmount({ total: 160_000, fx_rate_idr_usd: 0 })).toBeNull()
  })

  test('is null for a zero or invalid total', () => {
    expect(getExpectedUsdAmount({ total: 0, fx_rate_idr_usd: 16_000 })).toBeNull()
    expect(getExpectedUsdAmount({ total: 'abc', fx_rate_idr_usd: 16_000 })).toBeNull()
  })
})

test.describe('isCaptureVerified', () => {
  const verify = (c: PayPalCaptureResult, expectedAmount: number | null = 10) =>
    isCaptureVerified({ capture: c, orderNumber: 'BRN-001', expectedAmount })

  test('accepts a completed USD capture for the right order and amount', () => {
    expect(verify(capture())).toBe(true)
  })

  test('tolerates sub-cent rounding only', () => {
    expect(verify(capture({ capturedAmount: '10.01' }))).toBe(true)
    expect(verify(capture({ capturedAmount: '9.98' }))).toBe(false)
  })

  test('rejects an underpayment', () => {
    expect(verify(capture({ capturedAmount: '0.01' }))).toBe(false)
  })

  test('rejects a capture made for a different order', () => {
    expect(verify(capture({ customId: 'BRN-999' }))).toBe(false)
  })

  test('rejects the right number in the wrong currency', () => {
    expect(verify(capture({ capturedCurrency: 'JPY' }))).toBe(false)
  })

  test('rejects anything that is not COMPLETED', () => {
    expect(verify(capture({ status: 'APPROVED' }))).toBe(false)
  })

  test('rejects when the expected amount is unknown', () => {
    expect(verify(capture(), null)).toBe(false)
  })
})
