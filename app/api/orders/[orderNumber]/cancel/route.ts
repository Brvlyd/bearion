import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getServiceClient } from '@/lib/api-auth'
import { cancelOrderAndRestoreStock } from '@/lib/order-cancellation'

// POST /api/orders/[orderNumber]/cancel
//
// Lets a customer back out of an order that is still 'pending' and unpaid.
// 'pending' alone is not enough: approving a transfer proof marks the order
// paid, and a customer who has uploaded a proof is waiting on the admin — in
// both cases money has (probably) moved, so cancelling is the shop's call.

type RouteContext = {
  params: Promise<{ orderNumber: string }>
}

const NOT_CANCELLABLE = 'Only orders that are still pending can be cancelled'

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const caller = await authenticateRequest(request)
    if (!caller) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { orderNumber } = await context.params
    if (!orderNumber) {
      return NextResponse.json({ message: 'Missing orderNumber' }, { status: 400 })
    }

    const serviceClient = getServiceClient()

    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('id, user_id, status, payment_status')
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (orderError || !order || order.user_id !== caller.userId) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'pending' || order.payment_status === 'paid') {
      return NextResponse.json({ message: NOT_CANCELLABLE }, { status: 409 })
    }

    // A proof the admin has not rejected means money may already be on its way.
    // A rejected one does not, so the customer is free to walk away from it.
    const { data: proofs, error: proofsError } = await serviceClient
      .from('payments')
      .select('proof_verification_status')
      .eq('order_id', order.id)
      .not('payment_proof_url', 'is', null)

    const proofUnderReview =
      !!proofsError || (proofs || []).some((proof) => proof.proof_verification_status !== 'rejected')

    if (proofUnderReview) {
      return NextResponse.json(
        {
          message:
            'Bukti pembayaran Anda sedang diperiksa. Hubungi toko jika ingin membatalkan pesanan ini.',
          code: 'PROOF_UNDER_REVIEW',
        },
        { status: 409 }
      )
    }

    const outcome = await cancelOrderAndRestoreStock(serviceClient, {
      orderId: order.id,
      orderNumber,
      fromStatuses: ['pending'],
    })

    if (outcome === 'not_cancellable') {
      return NextResponse.json({ message: NOT_CANCELLABLE }, { status: 409 })
    }

    return NextResponse.json({ message: 'Order cancelled' }, { status: 200 })
  } catch (error) {
    console.error('Error cancelling order:', error)
    return NextResponse.json({ message: 'Failed to cancel order' }, { status: 500 })
  }
}
