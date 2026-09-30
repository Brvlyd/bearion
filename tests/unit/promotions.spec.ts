import { expect, test } from '@playwright/test'
import { evaluatePromotions, type PromotionContext } from '@/lib/promotions'
import type { ShippingPromotion } from '@/lib/supabase'

const promotion = (overrides: Partial<ShippingPromotion>): ShippingPromotion => ({
  id: overrides.id || 'promo',
  name: 'Promo',
  name_id: null,
  description: null,
  description_id: null,
  reward_type: 'free_shipping',
  reward_value: 0,
  max_discount: null,
  condition_type: 'min_items',
  condition_value: 5,
  scope: 'all',
  country_codes: null,
  courier_codes: null,
  stackable: false,
  priority: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
  usage_limit: null,
  usage_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const cart = (overrides: Partial<PromotionContext> = {}): PromotionContext => ({
  itemCount: 5,
  subtotal: 500_000,
  weightGrams: 1_000,
  shippingCost: 20_000,
  countryCode: 'ID',
  courierCode: 'jne',
  ...overrides,
})

const NOW = new Date('2026-06-01T00:00:00Z')

test('free shipping fires once the item threshold is met', () => {
  const outcome = evaluatePromotions([promotion({})], cart(), NOW)
  expect(outcome.shippingDiscount).toBe(20_000)
  expect(outcome.applied).toHaveLength(1)
})

test('below the threshold it reports a near miss instead', () => {
  const outcome = evaluatePromotions([promotion({})], cart({ itemCount: 3 }), NOW)
  expect(outcome.shippingDiscount).toBe(0)
  expect(outcome.nearMisses[0].remaining).toBe(2)
})

test('two exclusive promotions never discount the same shipping twice', () => {
  const outcome = evaluatePromotions(
    [promotion({ id: 'a' }), promotion({ id: 'b' })],
    cart(),
    NOW
  )
  expect(outcome.shippingDiscount).toBe(20_000)
  expect(outcome.applied).toHaveLength(1)
})

test('an order discount can never exceed the subtotal', () => {
  const outcome = evaluatePromotions(
    [promotion({ reward_type: 'order_fixed', reward_value: 900_000, condition_type: 'always' })],
    cart(),
    NOW
  )
  expect(outcome.orderDiscount).toBe(500_000)
})

test('percent rewards respect max_discount', () => {
  const outcome = evaluatePromotions(
    [
      promotion({
        reward_type: 'order_percent',
        reward_value: 50,
        max_discount: 30_000,
        condition_type: 'always',
      }),
    ],
    cart(),
    NOW
  )
  expect(outcome.orderDiscount).toBe(30_000)
})

test('inactive, expired, not-yet-started and used-up promotions are skipped', () => {
  const skipped = [
    promotion({ id: 'inactive', is_active: false }),
    promotion({ id: 'expired', ends_at: '2026-05-01T00:00:00Z' }),
    promotion({ id: 'future', starts_at: '2026-07-01T00:00:00Z' }),
    promotion({ id: 'used-up', usage_limit: 10, usage_count: 10 }),
  ]
  expect(evaluatePromotions(skipped, cart(), NOW).applied).toHaveLength(0)
})

test('domestic-only promotions do not apply abroad', () => {
  const outcome = evaluatePromotions(
    [promotion({ scope: 'domestic' })],
    cart({ countryCode: 'SG' }),
    NOW
  )
  expect(outcome.applied).toHaveLength(0)
})
