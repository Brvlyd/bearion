// Store-wide switches for features that are built but not launched yet.
//
// The shipping engine (couriers, zones, live rates) and tax are finished, but the
// client does not want either shown or charged while ongkir is still being sorted
// out. Turning them back on is flipping the flag here — nothing was deleted.

/**
 * Quote couriers at checkout, show the shipping line, and charge ongkir.
 * While false, orders are created with shipping_cost 0 and no courier picked;
 * admins still set the courier and tracking number by hand on the order page.
 */
export const SHIPPING_ENABLED: boolean = true

/** Charge and display PPN on orders. While false, every order stores tax 0. */
export const TAX_ENABLED: boolean = false

/** PPN rate used only when TAX_ENABLED is true. */
export const TAX_RATE = 0.11

/**
 * Hours a customer has to pay (or upload a transfer proof) before the order is
 * cancelled and its stock released. Must match the default max_age of
 * expire_stale_pending_orders() in db/migrations/order-integrity-guards.sql —
 * this copy only drives the deadline shown on the payment page.
 */
export const UNPAID_ORDER_EXPIRY_HOURS = 24
