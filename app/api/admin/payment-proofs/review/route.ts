import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdminUser } from '@/lib/api-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

type ReviewAction = 'approve' | 'reject'

interface ReviewRequestBody {
  paymentId: string
  orderId: string
  action: ReviewAction
  rejectionReason?: string
}

const PAYMENT_REJECTION_PREFIX = '[PAYMENT_REJECTION]'

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message

  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    const parts = [
      typeof err.message === 'string' ? err.message : '',
      typeof err.details === 'string' ? err.details : '',
      typeof err.hint === 'string' ? err.hint : '',
      typeof err.code === 'string' ? `code: ${err.code}` : '',
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return 'Unknown error'
}

const isPermissionOrSchemaIssue = (message: string) => {
  const lower = message.toLowerCase()
  return (
    lower.includes('pgrst204') ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('policy') ||
    (lower.includes('column') && lower.includes('proof_'))
  )
}

export async function POST(request: NextRequest) {
  try {
    const caller = await authenticateRequest(request)

    if (!caller) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const limit = checkRateLimit({
      key: `payment-proof-review:${caller.userId}:${getClientIp(request)}`,
      limit: 30,
      windowMs: 10 * 60 * 1000,
    })

    if (!limit.allowed) {
      return NextResponse.json(
        { message: 'Too many review requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json().catch(() => ({}))) as Partial<ReviewRequestBody>

    if (!body.paymentId || !body.orderId || !body.action) {
      console.warn('⚠️ Missing required fields:', { paymentId: !!body.paymentId, orderId: !!body.orderId, action: !!body.action })
      return NextResponse.json(
        { message: 'Missing required fields: paymentId, orderId, action' },
        { status: 400 }
      )
    }

    if (body.action === 'reject' && !body.rejectionReason?.trim()) {
      console.warn('⚠️ Rejection reason missing')
      return NextResponse.json(
        { message: 'Rejection reason is required for reject action' },
        { status: 400 }
      )
    }

    const isAdmin = await isAdminUser(caller)

    if (!isAdmin) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const supabaseAdmin = caller.sessionClient
    const { data: payment, error: paymentFetchError } = await supabaseAdmin
      .from('payments')
      .select('id, order_id, payment_proof_url')
      .eq('id', body.paymentId)
      .eq('order_id', body.orderId)
      .maybeSingle()

    if (paymentFetchError) {
      console.error('❌ Payment fetch error:', paymentFetchError)
      throw new Error(getErrorMessage(paymentFetchError))
    }

    if (!payment) {
      return NextResponse.json({ message: 'Payment record not found' }, { status: 404 })
    }

    if (body.action === 'approve' && !payment.payment_proof_url) {
      return NextResponse.json(
        { message: 'Payment proof is required before approval' },
        { status: 400 }
      )
    }

    const { data: existingOrder, error: orderFetchError } = await supabaseAdmin
      .from('orders')
      .select('admin_notes, status')
      .eq('id', body.orderId)
      .maybeSingle()

    if (orderFetchError) {
      console.error('❌ Order fetch error:', orderFetchError)
      throw new Error(getErrorMessage(orderFetchError))
    }

    // Cancelling already returned the stock, so approving now would confirm a
    // sale for goods that may be gone. The shop should refund instead.
    if (body.action === 'approve' && existingOrder?.status === 'cancelled') {
      return NextResponse.json(
        { message: 'Pesanan ini sudah dibatalkan. Kembalikan dana pembeli secara manual.' },
        { status: 409 }
      )
    }

    const verificationStatus = body.action === 'approve' ? 'verified' : 'rejected'
    const paymentStatus = body.action === 'approve' ? 'paid' : 'pending'

    let paymentUpdateWarning: string | null = null

    const { error: updatePaymentError } = await supabaseAdmin
      .from('payments')
      .update({
        proof_verification_status: verificationStatus,
        proof_verified_by: caller.userId,
        proof_verified_at: new Date().toISOString(),
        // Keep payments.status in step with the order, as a PayPal capture does.
        ...(body.action === 'approve'
          ? { status: 'success', paid_at: new Date().toISOString() }
          : {}),
      })
      .eq('id', body.paymentId)
      .eq('order_id', body.orderId)

    if (updatePaymentError) {
      const updatePaymentMessage = getErrorMessage(updatePaymentError)
      console.warn('⚠️ Payment update error:', updatePaymentMessage)

      if (isPermissionOrSchemaIssue(updatePaymentMessage)) {
        paymentUpdateWarning =
          'Approval succeeded, but proof verification columns are missing or blocked. Run add-payment-proof-verification.sql and fix-admin-orders-rls.sql in Supabase SQL Editor for full tracking.'
      } else {
        throw new Error(updatePaymentMessage)
      }
    }

    const currentAdminNotes = typeof existingOrder?.admin_notes === 'string' ? existingOrder.admin_notes : null

    const nextAdminNotes = body.action === 'reject'
      ? `${PAYMENT_REJECTION_PREFIX} ${body.rejectionReason?.trim() || ''}`.trim()
      : currentAdminNotes?.startsWith(PAYMENT_REJECTION_PREFIX)
      ? null
      : currentAdminNotes

    // An approved transfer confirms a still-pending order, same as a PayPal
    // capture. Without this the order stayed 'pending' after payment, and the
    // customer could still cancel an order they had already paid for.
    const confirmOrder = body.action === 'approve' && existingOrder?.status === 'pending'

    const { error: updateOrderError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: paymentStatus,
        admin_notes: nextAdminNotes,
        ...(confirmOrder ? { status: 'confirmed', confirmed_at: new Date().toISOString() } : {}),
      })
      .eq('id', body.orderId)

    if (updateOrderError) {
      console.error('❌ Order update error:', updateOrderError)
      throw new Error(getErrorMessage(updateOrderError))
    }

    return NextResponse.json(
      {
        message: paymentUpdateWarning
          ? body.action === 'approve'
            ? 'Payment approved with limited verification metadata'
            : 'Payment rejection saved with limited verification metadata'
          : body.action === 'approve'
          ? 'Payment proof approved successfully'
          : 'Payment proof rejected successfully',
        paymentId: body.paymentId,
        orderId: body.orderId,
        proofVerificationStatus: verificationStatus,
        paymentStatus,
        warning: paymentUpdateWarning,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in payment proof review API:', getErrorMessage(error))
    return NextResponse.json({ message: 'Failed to process payment proof review' }, { status: 500 })
  }
}