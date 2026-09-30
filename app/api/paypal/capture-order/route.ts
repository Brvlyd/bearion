import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getServiceClient } from '@/lib/api-auth'
import { capturePayPalOrder } from '@/lib/paypal'
import { clearUserCart } from '@/lib/shipping-cart'
import {
  getExpectedUsdAmount,
  isCaptureVerified,
  markCaptureFailed,
  markOrderPaid,
} from '@/lib/paypal-settlement'

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error')

// POST /api/paypal/capture-order
// Captures a previously created PayPal order and, only after independently verifying
// the result with PayPal, marks the matching internal order as paid.
export async function POST(request: NextRequest) {
  try {
    const caller = await authenticateRequest(request)

    if (!caller) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : ''
    const paypalOrderId = typeof body.paypalOrderId === 'string' ? body.paypalOrderId.trim() : ''

    if (!orderNumber || !paypalOrderId) {
      return NextResponse.json({ message: 'Missing orderNumber or paypalOrderId' }, { status: 400 })
    }

    const { data: order, error: orderError } = await caller.sessionClient
      .from('orders')
      .select('id, order_number, user_id, status, payment_status, total, fx_rate_idr_usd')
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (orderError || !order || order.user_id !== caller.userId) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 })
    }

    const serviceClient = getServiceClient()

    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .select('id, status, transaction_id')
      .eq('order_id', order.id)
      .eq('payment_gateway', 'paypal')
      .maybeSingle()

    if (paymentError || !payment) {
      return NextResponse.json(
        { message: 'PayPal payment record not found for this order' },
        { status: 404 }
      )
    }

    // Idempotent: if this was already captured (e.g. duplicate onApprove call), don't re-process.
    if (payment.status === 'success') {
      return NextResponse.json({ message: 'Payment already completed' }, { status: 200 })
    }

    // The PayPal order id must match the one we generated for this exact order —
    // this stops a capture for a different (e.g. cheaper) order being replayed here.
    if (payment.transaction_id !== paypalOrderId) {
      return NextResponse.json({ message: 'PayPal order does not match this order' }, { status: 400 })
    }

    // A cancelled (or expired) order has already given its stock back, so taking
    // money for it would sell goods that may no longer exist.
    if (order.status !== 'pending') {
      return NextResponse.json({ message: 'This order can no longer be paid' }, { status: 409 })
    }

    const capture = await capturePayPalOrder(paypalOrderId)
    const expectedAmount = getExpectedUsdAmount(order)

    if (!isCaptureVerified({ capture, orderNumber: order.order_number, expectedAmount })) {
      console.error('PayPal capture failed verification:', {
        orderNumber,
        paypalOrderId,
        capture,
        expectedAmount,
      })

      await markCaptureFailed(serviceClient, { paymentId: payment.id, capture })

      return NextResponse.json({ message: 'PayPal payment could not be verified' }, { status: 402 })
    }

    await markOrderPaid(serviceClient, {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentId: payment.id,
      capture,
      fallbackTransactionId: paypalOrderId,
    })

    // The browser clears the cart too, but it may never get the chance (tab
    // closed right after approving). Best-effort: the order is already paid.
    await clearUserCart(serviceClient, caller.userId).catch((error) =>
      console.error('Failed to clear cart after PayPal capture:', getErrorMessage(error))
    )

    return NextResponse.json({ message: 'Payment captured', orderNumber: order.order_number }, { status: 200 })
  } catch (error) {
    console.error('Error in PayPal capture-order API:', getErrorMessage(error))
    return NextResponse.json({ message: 'Failed to capture PayPal order' }, { status: 500 })
  }
}
