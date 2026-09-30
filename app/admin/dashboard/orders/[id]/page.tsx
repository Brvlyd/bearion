'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Order, OrderItem, ShippingAddress, Payment } from '@/lib/supabase'
import { orderService } from '@/lib/orders'
import { supabase } from '@/lib/supabase'
import { notificationService } from '@/lib/notifications'
import { usePaymentProofUrl } from '@/lib/payment-proof-url'
import { useLanguage } from '@/lib/i18n'
import { useDialog } from '@/lib/dialog'
import { SHIPPING_ENABLED } from '@/lib/store-config'
import SafeImage from '@/components/SafeImage'
import Notification from '@/components/Notification'
import OrderTrackingTimeline from '@/components/OrderTrackingTimeline'
import LoadingSpinner from '@/components/LoadingSpinner'
import Link from 'next/link'
import { 
  ArrowLeft, User, Mail, Phone, MapPin, Package, DollarSign, 
  Clock, CheckCircle, XCircle, Truck, CreditCard, Calendar,
  Edit, Save, AlertCircle, Copy, Check
} from 'lucide-react'

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { tr } = useLanguage()
  const { confirmDialog } = useDialog()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editStatus, setEditStatus] = useState<Order['status']>('pending')
  const [editPaymentStatus, setEditPaymentStatus] = useState<Order['payment_status']>('unpaid')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [courier, setCourier] = useState('')
  const [saving, setSaving] = useState(false)
  const [verifyingProof, setVerifyingProof] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | null>(null)
  const [proofStatusOverride, setProofStatusOverride] = useState<{
    proofUrl: string
    status: Payment['proof_verification_status']
  } | null>(null)
  const [proofMessage, setProofMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [bookingShipment, setBookingShipment] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)

  useEffect(() => {
    if (orderId) {
      loadOrderDetails()
    }
  }, [orderId])

  const { url: proofSignedUrl } = usePaymentProofUrl(payment?.id, !!payment?.payment_proof_url)

  const loadOrderDetails = async () => {
    try {
      setLoading(true)
      
      // Load order
      const orderData = await orderService.getOrderById(orderId)
      if (!orderData) {
        setNotification({ type: 'error', message: tr('Order not found', 'Pesanan tidak ditemukan') })
        router.push('/admin/dashboard/orders')
        return
      }
      setOrder(orderData)
      setEditStatus(orderData.status)
      setEditPaymentStatus(orderData.payment_status)
      setTrackingNumber(orderData.tracking_number || '')
      setCourier(orderData.courier || '')

      // Load order items
      const items = await orderService.getOrderItems(orderId)
      setOrderItems(items)

      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setPayment(paymentData || null)

      // Load shipping address if exists
      if (orderData.shipping_address_id) {
        const { data: address } = await supabase
          .from('shipping_addresses')
          .select('*')
          .eq('id', orderData.shipping_address_id)
          .single()
        
        if (address) {
          setShippingAddress(address)
        }
      }
    } catch (error) {
      console.error('Error loading order details:', error)
      setNotification({ type: 'error', message: tr('Failed to load order details', 'Gagal memuat detail pesanan') })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveChanges = async () => {
    if (!order) return

    const isManualBankTransfer = order.payment_method === 'bank_transfer'
    const willBeProcessed = ['processing', 'shipped', 'delivered'].includes(editStatus)

    if (isManualBankTransfer && willBeProcessed && !payment?.payment_proof_url) {
      setNotification({
        type: 'error',
        message: tr(
          'Cannot process this order before payment proof is uploaded by user.',
          'Pesanan tidak bisa diproses sebelum user mengupload bukti pembayaran.'
        ),
      })
      return
    }

    if (editStatus === 'cancelled' && order.status !== 'cancelled') {
      const confirmed = await confirmDialog(
        order.payment_status === 'paid'
          ? tr(
              'Cancel this order? Stock goes back to the store. The customer has already paid — refund them manually.',
              'Batalkan pesanan ini? Stok akan dikembalikan ke toko. Pembeli sudah membayar — kembalikan uangnya secara manual.'
            )
          : tr(
              'Cancel this order? Stock goes back to the store and this cannot be undone.',
              'Batalkan pesanan ini? Stok akan dikembalikan ke toko dan tindakan ini tidak bisa dibatalkan.'
            ),
        { isDangerous: true }
      )
      if (!confirmed) return
    }

    try {
      setSaving(true)

      // Update status if changed
      if (editStatus !== order.status) {
        await orderService.updateOrderStatus(orderId, editStatus)
      }

      // Update payment status if changed
      if (editPaymentStatus !== order.payment_status) {
        await orderService.updatePaymentStatus(orderId, editPaymentStatus)
      }

      // Update tracking info if provided
      if (trackingNumber && courier) {
        await orderService.updateTrackingInfo(orderId, trackingNumber, courier)
      }

      setNotification({ type: 'success', message: tr('Order updated successfully!', 'Pesanan berhasil diperbarui!') })
      setEditMode(false)
      await loadOrderDetails()
    } catch (error) {
      console.error('Error updating order:', error)
      const message = error instanceof Error ? error.message : ''
      if (message.includes('PAYMENT_PROOF_REQUIRED')) {
        setNotification({
          type: 'error',
          message: tr('Cannot process order before payment proof is uploaded.', 'Pesanan tidak bisa diproses sebelum bukti pembayaran diupload.'),
        })
      } else {
        setNotification({ type: 'error', message: tr('Failed to update order', 'Gagal memperbarui pesanan') })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCreateShipment = async () => {
    if (!order) return

    try {
      setBookingShipment(true)
      const updated = await orderService.createBiteshipShipment(order.id)
      setOrder((previous) => (previous ? { ...previous, ...updated } : previous))
      setTrackingNumber(updated.tracking_number || '')
      setNotification({
        type: 'success',
        message: tr('Shipment created! Resi is ready to print.', 'Pengiriman berhasil dibuat! Resi siap dicetak.'),
      })
    } catch (error) {
      console.error('Error creating Biteship shipment:', error)
      const message = error instanceof Error ? error.message : ''
      setNotification({
        type: 'error',
        message: message || tr('Failed to create shipment', 'Gagal membuat pengiriman'),
      })
    } finally {
      setBookingShipment(false)
    }
  }

  const copyToClipboard = async (text: string, type: 'email' | 'phone' | 'address') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'email') {
        setCopiedEmail(true)
        setTimeout(() => setCopiedEmail(false), 2000)
      } else if (type === 'phone') {
        setCopiedPhone(true)
        setTimeout(() => setCopiedPhone(false), 2000)
      } else if (type === 'address') {
        setCopiedAddress(true)
        setTimeout(() => setCopiedAddress(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const reviewPaymentProof = async (action: 'approve' | 'reject') => {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) {
      throw new Error(tr('Authentication session not found', 'Sesi autentikasi tidak ditemukan'))
    }

    if (!payment || !order) {
      throw new Error(tr('Order data not found', 'Data pesanan tidak ditemukan'))
    }

    const response = await fetch('/api/admin/payment-proofs/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        paymentId: payment.id,
        orderId,
        action,
        rejectionReason: action === 'reject' ? rejectionReason : undefined,
      }),
    })

    // Check content type
    const contentType = response.headers.get('content-type')
    let result: { message?: string; error?: string } = {}

    if (contentType?.includes('application/json')) {
      result = await response.json().catch(() => ({}))
    } else {
      // API returned HTML instead of JSON (likely 404 or error page)
      console.error('API returned non-JSON response:', {
        status: response.status,
        contentType,
        statusText: response.statusText,
      })
      const text = await response.text()
      console.error('Response body:', text.substring(0, 500))
      throw new Error(`API Error (${response.status}): ${response.statusText}. Check server logs.`)
    }

    if (!response.ok) {
      throw new Error(result.message || tr('Failed to verify payment proof.', 'Gagal memverifikasi bukti pembayaran.'))
    }

    return result as { message?: string; warning?: string }
  }

  const sendProofNotification = async (action: 'approve' | 'reject') => {
    if (!order || !payment || !order.customer_email) return

    try {
      if (action === 'approve') {
        await notificationService.sendPaymentProofVerifiedEmail(order.order_number)
      } else {
        await notificationService.sendPaymentProofRejectedEmail(order.order_number, rejectionReason)
      }
    } catch (error) {
      console.error('Error sending payment proof notification:', error)
    }
  }

  const getProofVerificationBadge = (status?: Payment['proof_verification_status']) => {
    const proofStatus = status || 'unverified'
    const config = {
      unverified: { label: tr('Unverified', 'Belum Diverifikasi'), color: 'bg-gray-100 text-gray-800' },
      pending: { label: tr('Pending', 'Menunggu'), color: 'bg-yellow-100 text-yellow-800' },
      verified: { label: tr('Verified', 'Terverifikasi'), color: 'bg-green-100 text-green-800' },
      rejected: { label: tr('Rejected', 'Ditolak'), color: 'bg-red-100 text-red-800' },
    }
    const badge = config[proofStatus as keyof typeof config] || config.unverified

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    )
  }

  const getEffectiveProofStatus = (
    paymentData: Payment | null,
    orderData: Order | null
  ): Payment['proof_verification_status'] => {
    if (
      proofStatusOverride &&
      paymentData?.payment_proof_url &&
      proofStatusOverride.proofUrl === paymentData.payment_proof_url
    ) {
      return proofStatusOverride.status
    }

    if (paymentData?.proof_verification_status) {
      return paymentData.proof_verification_status
    }

    if (orderData?.payment_status === 'paid') {
      return 'verified'
    }

    return 'pending'
  }

  const shouldShowProofActions = (status: Payment['proof_verification_status']) => {
    return status === 'pending' || status === 'unverified'
  }

  const handleVerifyPaymentProof = async () => {
    if (!payment || !order) return

    try {
      setVerifyingProof(true)
      setProofMessage(null)

      const currentProofUrl = payment.payment_proof_url

      const result = await reviewPaymentProof('approve')
      await sendProofNotification('approve')

      if (currentProofUrl) {
        setProofStatusOverride({
          proofUrl: currentProofUrl,
          status: 'verified',
        })
      }

      await loadOrderDetails()

      setProofMessage({
        type: 'success',
        text: result.warning
          ? `${tr('Payment approved, but verification metadata is limited.', 'Pembayaran disetujui, tetapi metadata verifikasi masih terbatas.')} ${result.warning}`
          : tr('Payment proof verified and customer notified.', 'Bukti pembayaran diverifikasi dan pelanggan sudah diberitahu.'),
      })
      setConfirmAction(null)
      setShowRejectForm(false)
      setRejectionReason('')
    } catch (error) {
      console.error('Error verifying payment proof:', error)
      setProofMessage({
        type: 'error',
        text: error instanceof Error ? error.message : tr('Failed to verify payment proof.', 'Gagal memverifikasi bukti pembayaran.'),
      })
    } finally {
      setVerifyingProof(false)
    }
  }

  const handleRejectPaymentProof = async () => {
    if (!payment || !order) return

    if (!rejectionReason.trim()) {
      setProofMessage({
        type: 'error',
        text: tr('Please provide rejection reason first.', 'Silakan isi alasan penolakan terlebih dahulu.'),
      })
      return
    }

    try {
      setVerifyingProof(true)
      setProofMessage(null)

      const currentProofUrl = payment.payment_proof_url

      const result = await reviewPaymentProof('reject')
      await sendProofNotification('reject')

      if (currentProofUrl) {
        setProofStatusOverride({
          proofUrl: currentProofUrl,
          status: 'rejected',
        })
      }

      await loadOrderDetails()

      setProofMessage({
        type: 'success',
        text: result.warning
          ? `${tr('Payment rejection saved, but verification metadata is limited.', 'Penolakan pembayaran disimpan, tetapi metadata verifikasi masih terbatas.')} ${result.warning}`
          : tr('Payment proof rejected and customer notified.', 'Bukti pembayaran ditolak dan pelanggan sudah diberitahu.'),
      })
      setConfirmAction(null)
      setRejectionReason('')
      setShowRejectForm(false)
    } catch (error) {
      console.error('Error rejecting payment proof:', error)
      setProofMessage({
        type: 'error',
        text: error instanceof Error ? error.message : tr('Failed to reject payment proof.', 'Gagal menolak bukti pembayaran.'),
      })
    } finally {
      setVerifyingProof(false)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: Order['status']) => {
    const statusConfig = {
      pending: { label: tr('Pending', 'Menunggu'), color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      confirmed: { label: tr('Confirmed', 'Dikonfirmasi'), color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
      processing: { label: tr('Processing', 'Diproses'), color: 'bg-purple-100 text-purple-800', icon: Package },
      shipped: { label: tr('Shipped', 'Dikirim'), color: 'bg-indigo-100 text-indigo-800', icon: Truck },
      delivered: { label: tr('Delivered', 'Terkirim'), color: 'bg-green-100 text-green-800', icon: CheckCircle },
      cancelled: { label: tr('Cancelled', 'Dibatalkan'), color: 'bg-red-100 text-red-800', icon: XCircle },
      refunded: { label: tr('Refunded', 'Dikembalikan'), color: 'bg-gray-100 text-gray-800', icon: DollarSign }
    }
    const config = statusConfig[status] || statusConfig.pending
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${config.color}`}>
        <Icon className="w-4 h-4" />
        {config.label}
      </span>
    )
  }

  const getPaymentBadge = (status: Order['payment_status']) => {
    const statusConfig = {
      unpaid: { label: tr('Unpaid', 'Belum Dibayar'), color: 'bg-gray-100 text-gray-800' },
      pending: { label: tr('Pending', 'Menunggu'), color: 'bg-yellow-100 text-yellow-800' },
      paid: { label: tr('Paid', 'Lunas'), color: 'bg-green-100 text-green-800' },
      failed: { label: tr('Failed', 'Gagal'), color: 'bg-red-100 text-red-800' },
      refunded: { label: tr('Refunded', 'Dikembalikan'), color: 'bg-purple-100 text-purple-800' }
    }
    const config = statusConfig[status] || statusConfig.unpaid
    return (
      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return <LoadingSpinner label={tr('Loading order details...', 'Memuat detail pesanan...')} />
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
        <p className="text-xl text-gray-700 mb-4">{tr('Order not found', 'Pesanan tidak ditemukan')}</p>
        <Link href="/admin/dashboard/orders" className="text-blue-600 hover:underline">
          {tr('Back to Orders', 'Kembali ke Pesanan')}
        </Link>
      </div>
    )
  }

  return (
    <div>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/dashboard/orders"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-black">{tr('Order Details', 'Detail Pesanan')}</h2>
            <p className="text-gray-600 font-mono">{order.order_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Edit className="w-4 h-4" />
              {tr('Edit Order', 'Ubah Pesanan')}
            </button>
          ) : (
            <>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {tr('Cancel', 'Batal')}
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? tr('Saving...', 'Menyimpan...') : tr('Save Changes', 'Simpan Perubahan')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alert untuk order yang sudah dibayar tapi belum dikirim */}
      {order.payment_status === 'paid' && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status) && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-6 rounded-lg mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-orange-100 p-3 rounded-full">
              <Truck className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 mb-2">{tr('Ready to Ship', 'Siap Dikirim')}</h3>
              <p className="text-orange-800 mb-3">
                {tr('This order has been paid and is waiting to be shipped. Please process the shipment and update the tracking information below.', 'Pesanan ini sudah dibayar dan menunggu pengiriman. Silakan proses pengiriman dan perbarui informasi pelacakan di bawah.')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditMode(true)
                    setEditStatus('processing')
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                >
                  {tr('Mark as Processing', 'Tandai Sedang Diproses')}
                </button>
                <button
                  onClick={() => {
                    setEditMode(true)
                    setEditStatus('shipped')
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  {tr('Mark as Shipped', 'Tandai Sudah Dikirim')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Status Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 text-black">{tr('Order Status', 'Status Pesanan')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">{tr('Order Status', 'Status Pesanan')}</label>
                {editMode ? (
                  <>
                  {/* Cancelling restored the stock, so reviving the order would
                      sell units the store may no longer have. */}
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Order['status'])}
                    disabled={order.status === 'cancelled'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="pending">{tr('Pending', 'Menunggu')}</option>
                    <option value="confirmed">{tr('Confirmed', 'Dikonfirmasi')}</option>
                    <option value="processing">{tr('Processing', 'Diproses')}</option>
                    <option value="shipped">{tr('Shipped', 'Dikirim')}</option>
                    <option value="delivered">{tr('Delivered', 'Terkirim')}</option>
                    <option value="cancelled">{tr('Cancelled', 'Dibatalkan')}</option>
                    <option value="refunded">{tr('Refunded', 'Dikembalikan')}</option>
                  </select>
                  {order.status === 'cancelled' && (
                    <p className="mt-1 text-xs text-gray-500">
                      {tr(
                        'Cancelled orders cannot be reopened. Ask the customer to order again.',
                        'Pesanan yang sudah dibatalkan tidak bisa dibuka lagi. Minta pembeli memesan ulang.'
                      )}
                    </p>
                  )}
                  </>
                ) : (
                  <div>{getStatusBadge(order.status)}</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">{tr('Payment Status', 'Status Pembayaran')}</label>
                {editMode ? (
                  <select
                    value={editPaymentStatus}
                    onChange={(e) => setEditPaymentStatus(e.target.value as Order['payment_status'])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  >
                    <option value="unpaid">{tr('Unpaid', 'Belum Dibayar')}</option>
                    <option value="pending">{tr('Pending', 'Menunggu')}</option>
                    <option value="paid">{tr('Paid', 'Lunas')}</option>
                    <option value="failed">{tr('Failed', 'Gagal')}</option>
                    <option value="refunded">{tr('Refunded', 'Dikembalikan')}</option>
                  </select>
                ) : (
                  <div>{getPaymentBadge(order.payment_status)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Customer Information */}
          <div className={`bg-white rounded-lg p-6 ${
            order.payment_status === 'paid' && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)
              ? 'border-2 border-orange-300 shadow-lg'
              : 'border border-gray-200'
          }`}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-black">
              <User className="w-5 h-5" />
              {tr('Customer Information', 'Informasi Pelanggan')}
              {order.payment_status === 'paid' && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status) && (
                <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">
                  {tr('Ready to Process', 'Siap Diproses')}
                </span>
              )}
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">{tr('Name', 'Nama')}</p>
                  <p className="font-medium text-black">{order.customer_name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">{tr('Email', 'Email')}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-black">{order.customer_email}</p>
                    <button
                      onClick={() => copyToClipboard(order.customer_email, 'email')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title={tr('Copy email', 'Salin email')}
                    >
                      {copiedEmail ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">{tr('Phone', 'Telepon')}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-black">{order.customer_phone}</p>
                    <button
                      onClick={() => copyToClipboard(order.customer_phone, 'phone')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title={tr('Copy phone', 'Salin telepon')}
                    >
                      {copiedPhone ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {shippingAddress && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center justify-between text-black">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  {tr('Shipping Address', 'Alamat Pengiriman')}
                </div>
                <button
                  onClick={() => {
                    const fullAddress = `${shippingAddress.recipient_name}\n${shippingAddress.phone}\n${shippingAddress.address_line1}${shippingAddress.address_line2 ? '\n' + shippingAddress.address_line2 : ''}\n${shippingAddress.city}, ${shippingAddress.province} ${shippingAddress.postal_code}\n${shippingAddress.country}`
                    copyToClipboard(fullAddress, 'address')
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title={tr('Copy full address', 'Salin alamat lengkap')}
                >
                  {copiedAddress ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">{tr('Copied!', 'Tersalin!')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{tr('Copy', 'Salin')}</span>
                    </>
                  )}
                </button>
              </h3>
              <div className="space-y-2 text-gray-700">
                <p className="font-medium text-black">{shippingAddress.recipient_name}</p>
                <p>{shippingAddress.phone}</p>
                <p>{shippingAddress.address_line1}</p>
                {shippingAddress.address_line2 && <p>{shippingAddress.address_line2}</p>}
                <p>{shippingAddress.city}, {shippingAddress.province} {shippingAddress.postal_code}</p>
                <p>{shippingAddress.country}</p>
                {shippingAddress.label && (
                  <span className="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    {shippingAddress.label}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tracking Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-black">
              <Truck className="w-5 h-5" />
              {tr('Shipping & Tracking', 'Pengiriman & Pelacakan')}
            </h3>

            {order.biteship_order_id ? (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {tr('Shipment booked with Biteship', 'Pengiriman sudah dibuat lewat Biteship')}
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    {tr('Status', 'Status')}: {order.biteship_status || '-'}
                  </p>
                </div>
                <Link
                  href={`/admin/dashboard/orders/${orderId}/resi`}
                  target="_blank"
                  className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {tr('Print Resi', 'Cetak Resi')}
                </Link>
              </div>
            ) : (
              order.shipping_provider === 'biteship' && (
                <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-700">
                    {tr(
                      'This order was quoted via Biteship — book a real shipment to get a waybill number.',
                      'Order ini dikutip lewat Biteship — buat pengiriman untuk dapat nomor resi asli.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateShipment}
                    disabled={bookingShipment || order.payment_status !== 'paid'}
                    title={
                      order.payment_status !== 'paid'
                        ? tr('Order must be paid first', 'Order harus lunas dulu')
                        : undefined
                    }
                    className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bookingShipment
                      ? tr('Creating...', 'Membuat...')
                      : tr('Create Shipment & Print Resi', 'Buat Pengiriman & Cetak Resi')}
                  </button>
                </div>
              )
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">{tr('Courier', 'Kurir')}</label>
                {editMode ? (
                  <input
                    type="text"
                    value={courier}
                    onChange={(e) => setCourier(e.target.value)}
                    placeholder={tr('e.g., JNE, J&T, SiCepat', 'contoh: JNE, J&T, SiCepat')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  />
                ) : (
                  <p className="text-black">{order.courier || '-'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">{tr('Tracking Number', 'Nomor Resi')}</label>
                {editMode ? (
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder={tr('Enter tracking number', 'Masukkan nomor resi')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  />
                ) : (
                  <p className="font-mono text-black">{order.tracking_number || '-'}</p>
                )}
              </div>
            </div>

            {/* Rate snapshot: what the courier charged vs what the customer
                paid, so a free-shipping promo is visible as a cost, not a gap. */}
            {(order.shipping_service_name || order.shipping_weight_grams) && (
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">{tr('Service', 'Layanan')}</p>
                  <p className="text-black font-medium">{order.shipping_service_name || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">{tr('Billable weight', 'Berat tertagih')}</p>
                  <p className="text-black font-medium">
                    {order.shipping_weight_grams
                      ? `${(order.shipping_weight_grams / 1000).toFixed(2)} kg`
                      : '-'}
                  </p>
                </div>
                {/* Orders placed while ongkir is hidden have no quote behind
                    them — only the packed weight is worth showing. */}
                {order.shipping_service_name && (
                  <>
                    <div>
                      <p className="text-gray-500 text-xs">{tr('Courier price', 'Harga kurir')}</p>
                      <p className="text-black font-medium">
                        {formatPrice(Number(order.shipping_base_cost || order.shipping_cost || 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">{tr('Promo subsidy', 'Subsidi promo')}</p>
                      <p className="text-black font-medium">
                        {Number(order.shipping_discount || 0) > 0
                          ? `-${formatPrice(Number(order.shipping_discount))}`
                          : '-'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-200">
              <OrderTrackingTimeline orderNumber={order.order_number} autoRefresh={false} />
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-black">
              <Package className="w-5 h-5" />
              {tr('Order Items', 'Item Pesanan')}
            </h3>
            <div className="space-y-4">
              {orderItems.map((item) => (
                <div key={item.id} className="flex gap-4 pb-4 border-b border-gray-200 last:border-0">
                  <div className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                    {item.product_image_url ? (
                      <SafeImage
                        src={item.product_image_url}
                        alt={item.product_name}
                        fill
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-black">{item.product_name}</h4>
                    {item.product_sku && (
                      <p className="text-sm text-gray-600">SKU: {item.product_sku}</p>
                    )}
                    <div className="flex gap-4 mt-1 text-sm text-gray-600">
                      {item.size && <span>{tr('Size', 'Ukuran')}: {item.size}</span>}
                      {item.color && <span>{tr('Color', 'Warna')}: {item.color}</span>}
                      <span>{tr('Qty', 'Jumlah')}: {item.quantity}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-black">{formatPrice(parseFloat(item.subtotal.toString()))}</p>
                    <p className="text-sm text-gray-600">{formatPrice(parseFloat(item.price.toString()))} {tr('each', 'per item')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {order.customer_notes && (
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
              <h3 className="text-lg font-semibold mb-2 text-black">{tr('Customer Notes', 'Catatan Pelanggan')}</h3>
              <p className="text-gray-700">{order.customer_notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Order Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 text-black">{tr('Order Summary', 'Ringkasan Pesanan')}</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-gray-700">
                <span>{tr('Subtotal', 'Subtotal')}</span>
                <span>{formatPrice(parseFloat(order.subtotal.toString()))}</span>
              </div>
              {(SHIPPING_ENABLED || parseFloat(order.shipping_cost.toString()) > 0) && (
                <div className="flex justify-between text-gray-700">
                  <span>{tr('Shipping Cost', 'Biaya Pengiriman')}</span>
                  <span>{formatPrice(parseFloat(order.shipping_cost.toString()))}</span>
                </div>
              )}
              {parseFloat(order.tax.toString()) > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>{tr('Tax', 'Pajak')}</span>
                  <span>{formatPrice(parseFloat(order.tax.toString()))}</span>
                </div>
              )}
              {parseFloat(order.discount.toString()) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{tr('Discount', 'Diskon')}</span>
                  <span>-{formatPrice(parseFloat(order.discount.toString()))}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-lg text-black">
                <span>{tr('Total', 'Total')}</span>
                <span>{formatPrice(parseFloat(order.total.toString()))}</span>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-black">
              <CreditCard className="w-5 h-5" />
              {tr('Payment Info', 'Info Pembayaran')}
            </h3>
            {proofMessage && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm border ${
                  proofMessage.type === 'success'
                    ? 'bg-green-50 border-green-300 text-green-800'
                    : 'bg-red-50 border-red-300 text-red-800'
                }`}
              >
                {proofMessage.text}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">{tr('Payment Method', 'Metode Pembayaran')}</p>
                <p className="font-medium text-black capitalize">{order.payment_method?.replace('_', ' ') || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">{tr('Payment Status', 'Status Pembayaran')}</p>
                <div className="mt-1">{getPaymentBadge(order.payment_status)}</div>
              </div>
              <div>
                <p className="text-sm text-gray-600">{tr('Payment Proof', 'Bukti Pembayaran')}</p>
                {payment?.payment_proof_url ? (
                  <div className="mt-2 space-y-3">
                    {proofSignedUrl ? (
                      <a
                        href={proofSignedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm font-medium text-black hover:underline"
                      >
                        {tr('View uploaded proof', 'Lihat bukti terupload')}
                      </a>
                    ) : (
                      <span className="inline-flex text-sm text-gray-500">
                        {tr('Loading proof link...', 'Memuat tautan bukti...')}
                      </span>
                    )}

                    <div>
                      <p className="text-sm text-gray-600 mb-1">{tr('Proof Verification', 'Verifikasi Bukti')}</p>
                      {getProofVerificationBadge(getEffectiveProofStatus(payment, order))}
                    </div>

                    {payment.proof_verified_at && (
                      <p className="text-xs text-gray-500">
                        {tr('Last verification', 'Verifikasi terakhir')}: {formatDate(payment.proof_verified_at)}
                      </p>
                    )}

                    {getEffectiveProofStatus(payment, order) === 'rejected' && (
                      <p className="text-xs text-red-600">
                        {tr(
                          'Proof is rejected. Wait for customer to upload a new proof before reviewing again.',
                          'Bukti ditolak. Tunggu customer upload bukti baru sebelum verifikasi ulang.'
                        )}
                      </p>
                    )}

                    {shouldShowProofActions(getEffectiveProofStatus(payment, order)) && (
                      <>
                        {showRejectForm ? (
                          <>
                            <textarea
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              placeholder={tr('Reason if rejected (required for reject action)', 'Alasan jika ditolak (wajib untuk aksi tolak)')}
                              rows={3}
                              className="w-full px-3 py-2 text-sm font-medium !text-black !caret-black placeholder:!text-gray-600 bg-white border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                              style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setShowRejectForm(false)
                                  setRejectionReason('')
                                }}
                                disabled={verifyingProof}
                                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {tr('Cancel Reject', 'Batal Tolak')}
                              </button>
                              <button
                                onClick={handleRejectPaymentProof}
                                disabled={verifyingProof || !rejectionReason.trim()}
                                className="px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {verifyingProof ? tr('Saving...', 'Menyimpan...') : tr('Submit Reject', 'Kirim Penolakan')}
                              </button>
                              <button
                                onClick={() => setConfirmAction('approve')}
                                disabled={verifyingProof}
                                className="px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {tr('Approve Proof', 'Setujui Bukti')}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowRejectForm(true)}
                              disabled={verifyingProof}
                              className="px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {tr('Reject Proof', 'Tolak Bukti')}
                            </button>
                            <button
                              onClick={() => setConfirmAction('approve')}
                              disabled={verifyingProof}
                              className="px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {tr('Approve Proof', 'Setujui Bukti')}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-red-600 mt-1">{tr('No proof uploaded yet', 'Belum ada bukti terupload')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-black">
              <Calendar className="w-5 h-5" />
              {tr('Timeline', 'Linimasa')}
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-600">{tr('Created', 'Dibuat')}</p>
                <p className="font-medium text-black">{formatDate(order.created_at)}</p>
              </div>
              {order.confirmed_at && (
                <div>
                  <p className="text-gray-600">{tr('Confirmed', 'Dikonfirmasi')}</p>
                  <p className="font-medium text-black">{formatDate(order.confirmed_at)}</p>
                </div>
              )}
              {order.shipped_at && (
                <div>
                  <p className="text-gray-600">{tr('Shipped', 'Dikirim')}</p>
                  <p className="font-medium text-black">{formatDate(order.shipped_at)}</p>
                </div>
              )}
              {order.delivered_at && (
                <div>
                  <p className="text-gray-600">{tr('Delivered', 'Terkirim')}</p>
                  <p className="font-medium text-black">{formatDate(order.delivered_at)}</p>
                </div>
              )}
              {order.cancelled_at && (
                <div>
                  <p className="text-red-600">{tr('Cancelled', 'Dibatalkan')}</p>
                  <p className="font-medium text-black">{formatDate(order.cancelled_at)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmAction === 'approve' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200 p-5">
            <h4 className="text-lg font-semibold text-black mb-2">
              {tr('Approve payment proof?', 'Setujui bukti pembayaran?')}
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              {tr('This will mark payment as paid and notify the customer.', 'Ini akan menandai pembayaran sebagai lunas dan memberi notifikasi ke pelanggan.')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {tr('Cancel', 'Batal')}
              </button>
              <button
                onClick={handleVerifyPaymentProof}
                disabled={verifyingProof}
                className="px-4 py-2 rounded-lg text-white disabled:opacity-50 bg-green-600 hover:bg-green-700"
              >
                {verifyingProof
                  ? tr('Saving...', 'Menyimpan...')
                  : tr('Confirm Approve', 'Konfirmasi Setujui')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
