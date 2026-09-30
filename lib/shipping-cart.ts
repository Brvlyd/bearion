import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParcelItem, RateDestination } from './shipping-types'
import type { ShippingAddress } from './supabase'
import { getEffectiveIdrPrice } from './price'

// Shared loaders for the two routes that price a cart: /api/shipping/rates and
// /api/orders/create. They must see identical inputs, otherwise the quote the
// customer accepts and the total the server charges can drift apart.

export type CartLine = {
  id: string
  quantity: number
  size: string | null
  color: string | null
  productId: string
  product: {
    id: string
    name: string
    price: number
    /** Without this the server would re-price a discounted cart at full price. */
    sale_price: number | null
    stock: number
    image_url: string | null
    weight_grams: number | null
    length_cm: number | null
    width_cm: number | null
    height_cm: number | null
  } | null
}

const CART_SELECT =
  'id, quantity, size, color, product_id, products(id, name, price, sale_price, stock, image_url, weight_grams, length_cm, width_cm, height_cm)'

type RawCartRow = Omit<CartLine, 'productId' | 'product'> & {
  product_id: string
  products: CartLine['product']
}

/** Every line in the user's cart, with the product fields needed to price and weigh it. */
export async function loadCartLines(
  client: SupabaseClient,
  userId: string
): Promise<CartLine[]> {
  // Mirrors cartService.getOrCreateCart's "most recent cart" pick. Some
  // accounts ended up with more than one cart row for the same user (a race
  // in getOrCreateCart let two concurrent calls both insert); a bare
  // .maybeSingle() errors out on that instead of picking one, and with the
  // error left unchecked it read as "no cart" — every rate quote and order
  // for that account silently saw an empty cart.
  const { data: carts, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (cartError) throw cartError

  const cart = carts?.[0]
  if (!cart) return []

  const { data, error } = await client
    .from('cart_items')
    .select(CART_SELECT)
    .eq('cart_id', cart.id)

  if (error) throw error

  return ((data || []) as unknown as RawCartRow[]).map((row) => ({
    id: row.id,
    quantity: Number(row.quantity) || 0,
    size: row.size,
    color: row.color,
    productId: row.product_id,
    product: row.products,
  }))
}

/**
 * Empties every cart the user owns once an order has taken its contents.
 *
 * Server-side so a closed tab or dropped connection after checkout cannot leave
 * the old items behind to be ordered (and their stock reserved) a second time.
 * Covers all cart rows because some accounts have duplicates (see above).
 */
export async function clearUserCart(client: SupabaseClient, userId: string): Promise<void> {
  const { data: carts, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)

  if (cartError) throw cartError

  const cartIds = (carts || []).map((cart) => cart.id as string)
  if (cartIds.length === 0) return

  const { error } = await client.from('cart_items').delete().in('cart_id', cartIds)
  if (error) throw error
}

export const toParcelItems = (lines: CartLine[]): ParcelItem[] =>
  lines.map((line) => ({
    quantity: line.quantity,
    weightGrams: line.product?.weight_grams ?? null,
    lengthCm: line.product?.length_cm ?? null,
    widthCm: line.product?.width_cm ?? null,
    heightCm: line.product?.height_cm ?? null,
  }))

/** Merchandise total in IDR, priced from the database rather than the request. */
export const computeSubtotal = (lines: CartLine[]): number => {
  const total = lines.reduce(
    (sum, line) => {
      const product = line.product
      const price = product ? getEffectiveIdrPrice(product) : 0
      return sum + price * line.quantity
    },
    0
  )
  return Math.round(total * 100) / 100
}

const ADDRESS_SELECT =
  'id, user_id, recipient_name, phone, address_line1, address_line2, city, province, postal_code, country, country_code, district, subdistrict, area_id, is_default, label, created_at, updated_at'

/**
 * The caller's own address, or null. Scoping the query by user_id is what stops
 * one customer quoting or shipping to another's address.
 */
export async function loadOwnedAddress(
  client: SupabaseClient,
  addressId: string,
  userId: string
): Promise<ShippingAddress | null> {
  const { data } = await client
    .from('shipping_addresses')
    .select(ADDRESS_SELECT)
    .eq('id', addressId)
    .eq('user_id', userId)
    .maybeSingle()

  return (data as ShippingAddress | null) || null
}

export const toDestination = (address: ShippingAddress): RateDestination => ({
  countryCode: (address.country_code || 'ID').toUpperCase(),
  province: address.province || '',
  city: address.city || '',
  district: address.district,
  postalCode: address.postal_code,
  areaId: address.area_id,
})
