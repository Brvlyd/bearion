import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/api-auth'
import { capturePayPalOrder, getPayPalOrder } from '@/lib/paypal'
import {
  getExpectedUsdAmount,
  isCaptureVerified,
  markCaptureFailed,
  markOrderPaid,
} from '@/lib/paypal-settlement'

// POST /api/paypal/reconcile
//
// The browser drives the capture, so a customer who approves in PayPal's window
// and then loses their connection leaves money authorised but never collected,
// and an order stuck on "pending" that nobody is watching. This sweep closes
// that window: it re-reads every stale pending PayPal payment straight from
// PayPal and finishes whatever the browser could not.
//
// Point a scheduler at it every 15-30 minutes. Guarded by a shared secret
// rather than a user session, because no user is logged in when it runs.

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error')

// Long enough that a checkout still in progress is never touched mid-flight.
const STALE_AFTER_MS = 15 * 60 * 1000

// One sweep should not run unbounded against PayPal; anything left over is
// picked up by the next run.
const MAX_PER_RUN = 50

export async function POST(request: NextRequest) {
  const expected = process.env.PAYPAL_SYNC_SECRET

  if (!expected) {
    return NextResponse.json({ message: 'PAYPAL_SYNC_SECRET is not configured' }, { status: 503 })
  }

  const provided =
    request.headers.get('x-sync-secret') ||
    (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')

  if (provided !== expected) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const serviceClient = getServiceClient()
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString()

    // transaction_id is the PayPal order id written by /api/paypal/create-order.
    // Without one there is nothing at PayPal to ask about.
    const { data: payments, error: paymentsError } = await serviceClient
      .from('payments')
      .select('id, order_id, transaction_id, updated_at')
      .eq('payment_gateway', 'paypal')
      .eq('status', 'pending')
      .not('transaction_id', 'is', null)
      .lt('updated_at', staleBefore)
      .order('updated_at', { ascending: true })
      .limit(MAX_PER_RUN)

    if (paymentsError) throw paymentsError

    let settled = 0
    let failed = 0
    let stillWaiting = 0
    let errored = 0

    // Sequential on purpose: a burst of parallel calls is the fastest way to hit
    // an upstream rate limit, and this job is never latency-sensitive.
    for (const payment of payments || []) {
      try {
        const { data: order, error: orderError } = await serviceClient
          .from('orders')
          .select('id, order_number, status, payment_status, total, fx_rate_idr_usd')
          .eq('id', payment.order_id)
          .maybeSingle()

        if (orderError || !order) {
          errored += 1
          console.error('PayPal reconcile: order not found for payment', payment.id, orderError)
          continue
        }

        if (order.payment_status === 'paid') {
          // The payment row lagged behind an order that is already settled.
          stillWaiting += 1
          continue
        }

        const paypalOrderId = payment.transaction_id as string
        const remote = await getPayPalOrder(paypalOrderId)

        // CREATED / PAYER_ACTION_REQUIRED mean the customer never finished.
        // Leave those alone: PayPal expires them on its own, and a cancelled
        // checkout is not a failure worth recording against the order.
        if (remote.status !== 'APPROVED' && remote.status !== 'COMPLETED') {
          stillWaiting += 1
          continue
        }

        // A cancelled or expired order already gave its stock back. Never capture
        // for it; if PayPal already took the money, flag it for a manual refund.
        if (order.status !== 'pending') {
          if (remote.status === 'COMPLETED') {
            errored += 1
            console.error(
              `CRITICAL: PayPal captured money for a ${order.status} order. Refund manually — ` +
                `orderNumber=${order.order_number}, paypalOrderId=${paypalOrderId}`
            )
          } else {
            stillWaiting += 1
          }
          continue
        }

        // APPROVED means the money was authorised but our capture never landed.
        const capture =
          remote.status === 'APPROVED' ? await capturePayPalOrder(paypalOrderId) : remote

        const expectedAmount = getExpectedUsdAmount(order)

        if (!isCaptureVerified({ capture, orderNumber: order.order_number, expectedAmount })) {
          console.error('PayPal reconcile: capture failed verification', {
            orderNumber: order.order_number,
            paypalOrderId,
            capture,
            expectedAmount,
          })
          await markCaptureFailed(serviceClient, { paymentId: payment.id, capture })
          failed += 1
          continue
        }

        await markOrderPaid(serviceClient, {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentId: payment.id,
          capture,
          fallbackTransactionId: paypalOrderId,
        })

        console.warn(
          `PayPal reconcile: settled an order the browser never captured — ` +
            `orderNumber=${order.order_number}, captureId=${capture.captureId}`
        )
        settled += 1
      } catch (error) {
        // One bad row must not abort the sweep; the next run retries it.
        errored += 1
        console.error('PayPal reconcile: failed on payment', payment.id, getErrorMessage(error))
      }
    }

    return NextResponse.json({
      scanned: payments?.length ?? 0,
      settled,
      failed,
      stillWaiting,
      errored,
    })
  } catch (error) {
    console.error('Error in PayPal reconcile job:', getErrorMessage(error))
    return NextResponse.json({ message: 'PayPal reconcile failed' }, { status: 500 })
  }
}
