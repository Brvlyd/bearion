import { expect, test } from '@playwright/test'
import {
  convertIdrToUsd,
  describeSalePriceDraft,
  getDiscountPercent,
  getEffectiveIdrPrice,
  isDiscounted,
} from '@/lib/price'

// getEffectiveIdrPrice is what /api/orders/create charges per unit, so these
// cases are the storefront's pricing contract.

test.describe('effective price', () => {
  test('uses the sale price when it is a real markdown', () => {
    const product = { price: 380_000, sale_price: 250_000 }
    expect(isDiscounted(product)).toBe(true)
    expect(getEffectiveIdrPrice(product)).toBe(250_000)
    expect(getDiscountPercent(product)).toBe(34)
  })

  test('ignores a "sale" price at or above the normal price', () => {
    expect(getEffectiveIdrPrice({ price: 100_000, sale_price: 100_000 })).toBe(100_000)
    expect(getEffectiveIdrPrice({ price: 100_000, sale_price: 150_000 })).toBe(100_000)
  })

  test('ignores zero, negative and missing sale prices', () => {
    expect(getEffectiveIdrPrice({ price: 100_000, sale_price: 0 })).toBe(100_000)
    expect(getEffectiveIdrPrice({ price: 100_000, sale_price: -5 })).toBe(100_000)
    expect(getEffectiveIdrPrice({ price: 100_000, sale_price: null })).toBe(100_000)
    expect(getDiscountPercent({ price: 100_000 })).toBeNull()
  })

  test('coerces numeric strings from Postgres', () => {
    expect(getEffectiveIdrPrice({ price: '120000' as unknown as number, sale_price: '99000' as unknown as number })).toBe(99_000)
  })
})

test('converts IDR to USD with two decimals', () => {
  expect(convertIdrToUsd(160_000, 16_000)).toBe('10.00')
  expect(convertIdrToUsd(99_000, 16_250)).toBe('6.09')
})

test.describe('admin sale price form', () => {
  test('previews a valid markdown', () => {
    expect(describeSalePriceDraft('200000', '150000')).toMatchObject({
      filled: true,
      invalid: false,
      percent: 25,
      savings: 50_000,
    })
  })

  test('refuses a sale price that raises the price', () => {
    expect(describeSalePriceDraft('200000', '250000').invalid).toBe(true)
  })

  test('treats an empty field as no sale', () => {
    expect(describeSalePriceDraft('200000', '')).toMatchObject({ filled: false, invalid: false })
  })
})
