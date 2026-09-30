import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getServiceClient } from '@/lib/api-auth'
import { createPayPalOrder, convertIdrToUsd, getIdrPerUsdRate } from '@/lib/paypal'

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error')

// POST /api/paypal/create-order
// Creates a live PayPal order for an existing internal order, converting IDR -> USD server-side.
// The client only ever sends an orderNumber — amounts are always recomputed from the database.
export async function POST(request: NextRequest) {
  try {
    const caller = await authenticateRequest(request)

    if (!caller) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : ''

    if (!orderNumber) {
      return NextResponse.json({ message: 'Missing orderNumber' }, { status: 400 })
    }

    // RLS scopes this SELECT to the caller's own orders; the explicit user_id check below is defense in depth.
    const { data: order, error: orderError } = await caller.sessionClient
      .from('orders')
      .select('id, order_number, total, user_id, status, payment_status, fx_rate_idr_usd')
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (orderError || !order || order.user_id !== caller.userId) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 })
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ message: 'Order is already paid' }, { status: 409 })
    }

    if (order.status !== 'pending') {
      return NextResponse.json({ message: 'This order can no longer be paid' }, { status: 409 })
    }

    const serviceClient = getServiceClient()

    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .select('id, status')
      .eq('order_id', order.id)
      .eq('payment_gateway', 'paypal')
      .maybeSingle()

    if (paymentError || !payment) {
      return NextResponse.json(
        { message: 'PayPal payment record not found for this order' },
        { status: 404 }
      )
    }

    if (payment.status === 'success') {
      return NextResponse.json({ message: 'Payment already completed' }, { status: 409 })
    }

    // Prefer the rate locked when the order was created, so the USD total the
    // customer is charged matches the one quoted at checkout. Orders created
    // before that column was populated fall back to a live rate.
    const lockedRate = Number(order.fx_rate_idr_usd)
    const hasLockedRate = Number.isFinite(lockedRate) && lockedRate > 0
    const idrPerUsd = hasLockedRate ? lockedRate : await getIdrPerUsdRate()

    // Capture verification recomputes the expected USD amount from this orders
    // column, so a rate fetched here must be stored before PayPal is involved.
    if (!hasLockedRate) {
      const { error: rateError } = await serviceClient
        .from('orders')
        .update({ fx_rate_idr_usd: idrPerUsd })
        .eq('id', order.id)

      if (rateError) {
        console.error('Failed to lock FX rate on order:', rateError)
        return NextResponse.json({ message: 'Failed to create PayPal order' }, { status: 500 })
      }
    }

    const usdAmount = convertIdrToUsd(order.total, idrPerUsd)

    // PayPal rejects a zero total, and it would otherwise mark the order paid
    // for nothing.
    if (Number(usdAmount) <= 0) {
      return NextResponse.json({ message: 'Order total is too small to pay with PayPal' }, { status: 400 })
    }

    const { paypalOrderId } = await createPayPalOrder({
      usdAmount,
      orderNumber: order.order_number,
    })

    const { error: updateError } = await serviceClient
      .from('payments')
      .update({
        transaction_id: paypalOrderId,
        amount: Number(usdAmount),
        currency: 'USD',
        gateway_response: { idrPerUsd, idrAmount: order.total, stage: 'created' },
      })
      .eq('id', payment.id)

    // The capture step matches this stored id against the one PayPal reports.
    // If it never landed, the customer would approve a payment we are then
    // forced to refuse — so fail here, while nothing has been charged.
    if (updateError) {
      console.error('Failed to store PayPal order id on payment record:', updateError)
      return NextResponse.json({ message: 'Failed to create PayPal order' }, { status: 500 })
    }

    return NextResponse.json({ paypalOrderId, usdAmount }, { status: 200 })
  } catch (error) {
    console.error('Error in PayPal create-order API:', getErrorMessage(error))
    return NextResponse.json({ message: 'Failed to create PayPal order' }, { status: 500 })
  }
}
