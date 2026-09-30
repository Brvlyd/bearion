import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getServiceClient, isAdminUser } from '@/lib/api-auth'
import { cancelOrderAndRestoreStock } from '@/lib/order-cancellation'

// POST /api/admin/orders/[id]/cancel
//
// Admin cancellation. Goes through the server (not a plain RLS update from the
// browser) because the stock taken at checkout has to be restored, and that
// needs the service role. Parcels already handed to a courier can't be
// un-shipped, so only orders not yet shipped qualify.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params
    const caller = await authenticateRequest(request)

    if (!caller) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdminUser(caller))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const serviceClient = getServiceClient()

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_number')
      .eq('id', orderId)
      .maybeSingle()

    if (!order) {
      return NextResponse.json({ message: 'Pesanan tidak ditemukan.' }, { status: 404 })
    }

    const outcome = await cancelOrderAndRestoreStock(serviceClient, {
      orderId: order.id,
      orderNumber: order.order_number,
      fromStatuses: ['pending', 'confirmed', 'processing'],
    })

    if (outcome === 'not_cancellable') {
      return NextResponse.json(
        { message: 'Pesanan yang sudah dikirim, selesai, atau sudah dibatalkan tidak bisa dibatalkan.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ message: 'Pesanan dibatalkan dan stok dikembalikan.' })
  } catch (error) {
    console.error('Error cancelling order (admin):', error)
    return NextResponse.json({ message: 'Gagal membatalkan pesanan.' }, { status: 500 })
  }
}
