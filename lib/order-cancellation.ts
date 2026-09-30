import type { SupabaseClient } from '@supabase/supabase-js'
import type { Order } from './supabase'

// One cancellation path for customers and admins alike.
//
// Stock is taken the moment order_items are inserted (trigger
// update_product_stock_after_order), so every cancellation has to hand it back.
// Before this helper only the customer route did; an admin picking "Cancelled"
// from the order page left those units unsellable forever.

export type CancelOutcome = 'cancelled' | 'not_cancellable'

/**
 * Cancels the order only while its status is still one of `fromStatuses`, then
 * voids unpaid payment rows and restores stock. Requires a service-role client:
 * restore_order_stock is not granted to regular users.
 *
 * The status guard sits on the UPDATE itself, so two concurrent cancels (or a
 * cancel racing an admin confirming the order) restore stock at most once.
 */
export async function cancelOrderAndRestoreStock(
  serviceClient: SupabaseClient,
  params: {
    orderId: string
    orderNumber: string
    fromStatuses: Order['status'][]
  }
): Promise<CancelOutcome> {
  const { orderId, orderNumber, fromStatuses } = params

  const { data: cancelled, error: updateError } = await serviceClient
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', orderId)
    .in('status', fromStatuses)
    .select('id')
    .maybeSingle()

  if (updateError) throw updateError
  if (!cancelled) return 'not_cancellable'

  // A successful payment stays on record: that money has to be refunded by hand.
  await serviceClient
    .from('payments')
    .update({ status: 'cancelled' })
    .eq('order_id', orderId)
    .neq('status', 'success')

  const { error: stockError } = await serviceClient.rpc('restore_order_stock', {
    target_order_id: orderId,
  })

  // The order is already cancelled — a stock hiccup shouldn't undo that. Log it
  // for manual reconciliation instead of failing the request.
  if (stockError) {
    console.error(`Failed to restore stock after cancelling order ${orderNumber}:`, stockError)
  }

  return 'cancelled'
}
