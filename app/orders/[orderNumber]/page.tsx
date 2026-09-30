'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardList, CreditCard, MapPin, Package, Truck, XCircle } from 'lucide-react'
import { authService } from '@/lib/auth'
import { orderService } from '@/lib/orders'
import { supabase, type Order, type OrderItem, type Payment, type ShippingAddress } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import { useDialog } from '@/lib/dialog'
import { SHIPPING_ENABLED, TAX_ENABLED } from '@/lib/store-config'
import OrderTrackingTimeline from '@/components/OrderTrackingTimeline'
import LoadingSpinner from '@/components/LoadingSpinner'
import PayPalCheckoutButton from '@/components/PayPalCheckoutButton'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not-found'

export default function UserOrderDetailPage() {
  const router = useRouter()
  const { tr } = useLanguage()
  const { alertDialog } = useDialog()
  const params = useParams<{ orderNumber: string }>()
  const orderNumberParam = params?.orderNumber
  const orderNumber = Array.isArray(orderNumberParam) ? orderNumberParam[0] : orderNumberParam

  const [state, setState] = useState<LoadState>('loading')
  const [order, setOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [paypalError, setPaypalError] = useState('')
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const PAYMENT_REJECTION_PREFIX = '[PAYMENT_REJECTION]'

  const rejectionReason = useMemo(() => {
    const notes = order?.admin_notes || ''
    if (!notes.startsWith(PAYMENT_REJECTION_PREFIX)) return null
    const reason = notes.slice(PAYMENT_REJECTION_PREFIX.length).trim()
    return reason || null
  }, [order?.admin_notes])

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const paymentActionRequired = useMemo(() => {
    if (!order) return false
    if (!payment) return false

    const isManual = order.payment_method === 'bank_transfer'
    const noProofUploaded = !payment.payment_proof_url
    const rejectedProof = payment.proof_verification_status === 'rejected' || !!rejectionReason
    const notPaid = ['unpaid', 'pending', 'failed'].includes(order.payment_status)

    return isManual && (noProofUploaded || rejectedProof) && notPaid
  }, [order, payment, rejectionReason])

  const statusBadgeClass = (status: Order['status']) => {
    const map: Record<Order['status'], string> = {
      pending: 'bg-amber-100 text-amber-700',
      confirmed: 'bg-blue-100 text-blue-700',
      processing: 'bg-indigo-100 text-indigo-700',
      shipped: 'bg-cyan-100 text-cyan-700',
      delivered: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
      refunded: 'bg-gray-200 text-gray-700',
    }

    return map[status] || 'bg-gray-200 text-gray-700'
  }

  const statusLabel = (status: Order['status']) => {
    const map: Record<Order['status'], string> = {
      pending: tr('Pending', 'Menunggu'),
      confirmed: tr('Confirmed', 'Dikonfirmasi'),
      processing: tr('Processing', 'Diproses'),
      shipped: tr('Shipped', 'Dikirim'),
      delivered: tr('Delivered', 'Terkirim'),
      cancelled: tr('Cancelled', 'Dibatalkan'),
      refunded: tr('Refunded', 'Dikembalikan'),
    }

    return map[status] || status
  }

  useEffect(() => {
    const run = async () => {
      if (!orderNumber) {
        setState('not-found')
        return
      }

      try {
        setState('loading')

        const current = await authService.getCurrentUser()
        if (!current || current.role !== 'user') {
          router.push(`/login?redirect=/orders/${encodeURIComponent(orderNumber)}`)
          return
        }

        const orderData = await orderService.getOrderByNumber(orderNumber)
        if (!orderData) {
          setState('not-found')
          return
        }

        if (!orderData.user_id || orderData.user_id !== current.user.id) {
          setState('forbidden')
          return
        }

        setOrder(orderData)

        const [items, paymentResult] = await Promise.all([
          orderService.getOrderItems(orderData.id),
          supabase
            .from('payments')
            .select('*')
            .eq('order_id', orderData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        setOrderItems(items)
        setPayment(paymentResult.data || null)

        if (orderData.shipping_address_id) {
          const { data: addressData } = await supabase
            .from('shipping_addresses')
            .select('*')
            .eq('id', orderData.shipping_address_id)
            .maybeSingle()

          setShippingAddress(addressData || null)
        }

        setState('ready')
      } catch (error) {
        console.error('Error loading user order detail:', error)
        setState('not-found')
      }
    }

    void run()
  }, [orderNumber, router])

  // Re-fetch just the order + payment after an in-place action (pay again,
  // cancel) — no full-page spinner, no re-checking auth or the address again.
  const refreshOrderAndPayment = useCallback(async () => {
    if (!orderNumber) return

    const orderData = await orderService.getOrderByNumber(orderNumber)
    if (!orderData) return

    setOrder(orderData)

    const paymentResult = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderData.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setPayment(paymentResult.data || null)
  }, [orderNumber])

  const canPayAgainWithPaypal = useMemo(() => {
    if (!order) return false
    return order.payment_method === 'paypal' && order.payment_status !== 'paid'
  }, [order])

  // Mirrors the server rule in /api/orders/[orderNumber]/cancel: once paid, or
  // while a transfer proof waits for the admin, cancelling is the shop's call.
  const proofUnderReview =
    !!payment?.payment_proof_url && payment.proof_verification_status !== 'rejected'
  const canCancelOrder =
    order?.status === 'pending' && order.payment_status !== 'paid' && !proofUnderReview

  const handlePaypalPayAgainSuccess = () => {
    setPaypalError('')
    void refreshOrderAndPayment()
  }

  const handleCancelOrder = async () => {
    if (!order) return

    try {
      setCancelling(true)
      await orderService.cancelOrder(order.order_number)
      setCancelModalOpen(false)
      await refreshOrderAndPayment()
    } catch (error) {
      console.error('Error cancelling order:', error)
      const message = error instanceof Error ? error.message : ''
      setCancelModalOpen(false)
      await alertDialog(
        message.includes('Bukti pembayaran')
          ? tr(
              'Your payment proof is being reviewed. Please contact the store to cancel this order.',
              'Bukti pembayaran Anda sedang diperiksa. Hubungi toko jika ingin membatalkan pesanan ini.'
            )
          : message.includes('pending')
          ? tr(
              'This order can no longer be cancelled — it may already be confirmed.',
              'Pesanan ini sudah tidak bisa dibatalkan — mungkin sudah dikonfirmasi.'
            )
          : tr('Failed to cancel the order. Please try again.', 'Gagal membatalkan pesanan. Silakan coba lagi.'),
        { variant: 'error' }
      )
    } finally {
      setCancelling(false)
    }
  }

  if (state === 'loading') {
    return <LoadingSpinner fullScreen label={tr('Loading order details...', 'Memuat detail pesanan...')} />
  }

  if (state === 'forbidden') {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center">
          <h1 className="text-xl font-bold text-black mb-2">{tr('Access denied', 'Akses ditolak')}</h1>
          <p className="text-gray-600 mb-4">
            {tr('You cannot open this order detail.', 'Anda tidak dapat membuka detail pesanan ini.')}
          </p>
          <Link href="/profile" className="text-black font-semibold hover:underline">
            {tr('Back to profile', 'Kembali ke profil')}
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'not-found' || !order) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-black mb-2">{tr('Order not found', 'Pesanan tidak ditemukan')}</h1>
          <p className="text-gray-600 mb-4">
            {tr('This order may be deleted or unavailable.', 'Pesanan ini mungkin sudah dihapus atau tidak tersedia.')}
          </p>
          <Link href="/profile" className="text-black font-semibold hover:underline">
            {tr('Back to profile', 'Kembali ke profil')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/profile" className="inline-flex items-center gap-2 text-gray-700 hover:text-black">
            <ArrowLeft className="w-4 h-4" />
            {tr('Back to profile', 'Kembali ke profil')}
          </Link>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusBadgeClass(order.status)}`}>
            {statusLabel(order.status)}
          </span>
        </div>

        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-black">{tr('Order Detail', 'Detail Pesanan')}</h1>
          <p className="text-gray-600 mt-1">{tr('Order Number', 'Nomor Pesanan')}: {order.order_number}</p>
          <p className="text-gray-600">{new Date(order.created_at).toLocaleString('id-ID')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{tr('Total Payment', 'Total Pembayaran')}</p>
              <p className="font-bold text-black">{formatPrice(Number(order.total || 0))}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{tr('Payment Status', 'Status Pembayaran')}</p>
              <p className="font-semibold text-black">{order.payment_status}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{tr('Payment Method', 'Metode Pembayaran')}</p>
              <p className="font-semibold text-black">{order.payment_method || '-'}</p>
            </div>
          </div>

          {paymentActionRequired && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              {rejectionReason && (
                <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">
                    {tr('Payment proof was rejected by admin.', 'Bukti pembayaran ditolak oleh admin.')}
                  </p>
                  <p className="text-sm text-red-700">
                    {tr('Reason', 'Alasan')}: {rejectionReason}
                  </p>
                </div>
              )}
              <p className="text-sm text-amber-800 mb-2">
                {tr(
                  'Upload a new payment proof to continue verification.',
                  'Silakan upload ulang bukti pembayaran untuk lanjut verifikasi.'
                )}
              </p>
              <Link
                href={`/payment/${order.order_number}`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800"
              >
                <CreditCard className="w-4 h-4" />
                {tr('Upload payment proof again', 'Upload ulang bukti pembayaran')}
              </Link>
            </div>
          )}

          {canPayAgainWithPaypal && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800 mb-3">
                {tr(
                  'Payment was not completed. Pay again with PayPal to finish this order.',
                  'Pembayaran belum selesai. Bayar lagi dengan PayPal untuk menyelesaikan pesanan ini.'
                )}
              </p>
              {paypalError && (
                <p className="text-sm text-red-600 mb-2">{paypalError}</p>
              )}
              <PayPalCheckoutButton
                orderNumber={order.order_number}
                onSuccess={handlePaypalPayAgainSuccess}
                onError={setPaypalError}
              />
            </div>
          )}

          {canCancelOrder && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                {tr(
                  'Changed your mind? You can cancel this order while it is still pending.',
                  'Berubah pikiran? Anda bisa membatalkan pesanan ini selama masih berstatus menunggu.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50"
              >
                <XCircle className="w-4 h-4" />
                {tr('Cancel Order', 'Batalkan Pesanan')}
              </button>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black mb-3 inline-flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {tr('Shipping Information', 'Informasi Pengiriman')}
          </h2>

          {shippingAddress ? (
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-semibold text-black">{shippingAddress.recipient_name} ({shippingAddress.phone})</p>
              <p>{shippingAddress.address_line1}</p>
              {shippingAddress.address_line2 && <p>{shippingAddress.address_line2}</p>}
              <p>{shippingAddress.city}, {shippingAddress.province} {shippingAddress.postal_code}</p>
              <p>{shippingAddress.country}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-600">{tr('Shipping address is not available.', 'Alamat pengiriman tidak tersedia.')}</p>
          )}

        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black mb-4 inline-flex items-center gap-2">
            <Truck className="w-5 h-5" />
            {tr('Track Your Parcel', 'Lacak Paket Anda')}
          </h2>
          <OrderTrackingTimeline orderNumber={order.order_number} />
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black mb-3 inline-flex items-center gap-2">
            <Package className="w-5 h-5" />
            {tr('Ordered Items', 'Item Pesanan')}
          </h2>

          <div className="space-y-3">
            {orderItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 p-3 flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {item.product_image_url ? (
                    <img src={item.product_image_url} alt={item.product_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">{tr('No Image', 'Tanpa Gambar')}</div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-black">{item.product_name}</p>
                  <p className="text-sm text-gray-600">
                    {tr('Qty', 'Jumlah')}: {item.quantity}
                    {item.size ? ` • ${tr('Size', 'Ukuran')}: ${item.size}` : ''}
                    {item.color ? ` • ${tr('Color', 'Warna')}: ${item.color}` : ''}
                  </p>
                </div>
                <p className="font-semibold text-black">{formatPrice(Number(item.subtotal || 0))}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 space-y-1 text-sm text-gray-700">
            <div className="flex justify-between"><span>{tr('Subtotal', 'Subtotal')}</span><span>{formatPrice(Number(order.subtotal || 0))}</span></div>
            {Number(order.discount || 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>{tr('Discount', 'Diskon')}</span>
                <span>-{formatPrice(Number(order.discount))}</span>
              </div>
            )}
            {/* Orders placed while ongkir was hidden carry no shipping line at
                all; older orders still show what they were actually charged. */}
            {(SHIPPING_ENABLED || Number(order.shipping_cost || 0) > 0) && (
              <div className="flex justify-between">
                <span>
                  {tr('Shipping', 'Ongkir')}
                  {order.shipping_service_name && (
                    <span className="block text-xs text-gray-500">
                      {order.courier}
                    </span>
                  )}
                </span>
                <span className="text-right">
                  {/* Show what the courier charged next to what was paid, so a
                      free-shipping promo reads as a saving rather than a mystery. */}
                  {Number(order.shipping_discount || 0) > 0 && (
                    <span className="block text-xs text-gray-400 line-through">
                      {formatPrice(Number(order.shipping_base_cost || 0))}
                    </span>
                  )}
                  {Number(order.shipping_cost || 0) === 0
                    ? <span className="font-semibold text-emerald-600">{tr('FREE', 'GRATIS')}</span>
                    : formatPrice(Number(order.shipping_cost || 0))}
                </span>
              </div>
            )}
            {(order.applied_promotions || []).map((promotion) => (
              <p key={promotion.id} className="text-xs text-emerald-700">
                {promotion.name_id || promotion.name}
              </p>
            ))}
            {(TAX_ENABLED || Number(order.tax || 0) > 0) && (
              <div className="flex justify-between"><span>{tr('Tax', 'Pajak')}</span><span>{formatPrice(Number(order.tax || 0))}</span></div>
            )}
            <div className="flex justify-between text-base font-bold text-black pt-1"><span>{tr('Total', 'Total')}</span><span>{formatPrice(Number(order.total || 0))}</span></div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black mb-2 inline-flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            {tr('Order Notes', 'Catatan Pesanan')}
          </h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {order.customer_notes || tr('No notes from customer.', 'Tidak ada catatan dari pelanggan.')}
          </p>
        </section>
      </div>

      <ConfirmDeleteModal
        isOpen={cancelModalOpen}
        title={tr('Cancel Order', 'Batalkan Pesanan')}
        description={tr(
          'Are you sure you want to cancel this order? This action cannot be undone.',
          'Apakah Anda yakin ingin membatalkan pesanan ini? Tindakan ini tidak dapat dibatalkan.'
        )}
        itemName={order.order_number}
        isLoading={cancelling}
        onConfirm={() => {
          void handleCancelOrder()
        }}
        onCancel={() => setCancelModalOpen(false)}
        confirmText={tr('Cancel Order', 'Batalkan Pesanan')}
        cancelText={tr('Keep Order', 'Pertahankan Pesanan')}
        isDangerous={true}
      />
    </div>
  )
}
