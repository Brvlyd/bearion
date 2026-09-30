'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, CreditCard, FileUp, Image as ImageIcon, ReceiptText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { orderService } from '@/lib/orders'
import { paymentService } from '@/lib/payments'
import { usePaymentProofUrl } from '@/lib/payment-proof-url'
import { DEFAULT_PAYMENT_METHODS, parsePaymentMethodError } from '@/lib/payment-methods'
import { useLanguage } from '@/lib/i18n'
import { UNPAID_ORDER_EXPIRY_HOURS } from '@/lib/store-config'
import LoadingSpinner from '@/components/LoadingSpinner'
import type { Order, Payment, PaymentMethodConfig } from '@/lib/supabase'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export default function PaymentPage() {
  const router = useRouter()
  const params = useParams()
  const { tr, language } = useLanguage()

  const orderNumber = params.orderNumber as string

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [paymentMethodConfig, setPaymentMethodConfig] = useState<PaymentMethodConfig | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const PAYMENT_REJECTION_PREFIX = '[PAYMENT_REJECTION]'

  const rejectionReason = useMemo(() => {
    const notes = order?.admin_notes || ''
    if (!notes.startsWith(PAYMENT_REJECTION_PREFIX)) return null
    const reason = notes.slice(PAYMENT_REJECTION_PREFIX.length).trim()
    return reason || null
  }, [order?.admin_notes])

  useEffect(() => {
    void loadPaymentData()
  }, [orderNumber])

  const loadPaymentData = async () => {
    try {
      setLoading(true)
      setPageError('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/login?redirect=/payment/${orderNumber}`)
        return
      }

      const orderData = await orderService.getOrderByNumber(orderNumber)

      if (!orderData || orderData.user_id !== user.id) {
        setPageError(tr('Order not found or inaccessible', 'Pesanan tidak ditemukan atau tidak dapat diakses'))
        return
      }

      const paymentData = await paymentService.getPaymentByOrderId(orderData.id)

      if (!paymentData) {
        setPageError(tr('Payment data not found for this order', 'Data pembayaran untuk pesanan ini tidak ditemukan'))
        return
      }

      setOrder(orderData)
      setPayment(paymentData)

      const methodCode = orderData.payment_method || 'bank_transfer'
      const { data: methodData, error: methodError } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('code', methodCode)
        .maybeSingle()

      if (methodError) {
        const parsed = parsePaymentMethodError(methodError)
        console.error('Failed to load payment method config:', parsed)
      }

      const fallbackMethod = DEFAULT_PAYMENT_METHODS.find((method) => method.code === methodCode) || DEFAULT_PAYMENT_METHODS[0] || null
      setPaymentMethodConfig((methodData as PaymentMethodConfig | null) || fallbackMethod)
    } catch (error) {
      console.error('Error loading payment page:', error)
      setPageError(tr('Failed to load payment page', 'Gagal memuat halaman pembayaran'))
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value)
  }

  const handleSelectFile = (file: File | null) => {
    setFileError('')
    setSuccessMessage('')

    if (!file) {
      setSelectedFile(null)
      return
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError(
        tr(
          'Invalid file type. Use JPG, PNG, WEBP, or PDF.',
          'Tipe file tidak valid. Gunakan JPG, PNG, WEBP, atau PDF.'
        )
      )
      setSelectedFile(null)
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError(tr('File size exceeds 2MB', 'Ukuran file melebihi 2MB'))
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
  }

  const handleUploadProof = async () => {
    if (!order || !payment || !selectedFile) return

    try {
      setUploading(true)
      setFileError('')
      setSuccessMessage('')

      const updatedPayment = await paymentService.submitPaymentProof(order.id, selectedFile)
      setPayment(updatedPayment)
      setSelectedFile(null)
      setSuccessMessage(
        tr(
          'Payment proof uploaded. Your order is waiting for admin verification.',
          'Bukti pembayaran berhasil diupload. Pesanan Anda sedang menunggu verifikasi admin.'
        )
      )

      await loadPaymentData()
    } catch (error) {
      console.error('Error uploading payment proof:', error)
      const message = error instanceof Error ? error.message : ''
      if (message.includes('INVALID_PAYMENT_PROOF_TYPE')) {
        setFileError(
          tr(
            'Invalid file type. Use JPG, PNG, WEBP, or PDF.',
            'Tipe file tidak valid. Gunakan JPG, PNG, WEBP, atau PDF.'
          )
        )
      } else if (message.includes('PAYMENT_PROOF_TOO_LARGE')) {
        setFileError(tr('File size exceeds 2MB', 'Ukuran file melebihi 2MB'))
      } else {
        setFileError(tr('Failed to upload payment proof', 'Gagal mengupload bukti pembayaran'))
      }
    } finally {
      setUploading(false)
    }
  }

  const isProofImage = useMemo(() => {
    if (!payment?.payment_proof_url) return false
    return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(payment.payment_proof_url)
  }, [payment?.payment_proof_url])

  const { url: proofSignedUrl } = usePaymentProofUrl(payment?.id, !!payment?.payment_proof_url)

  if (loading) {
    return <LoadingSpinner fullScreen label={tr('Loading payment page...', 'Memuat halaman pembayaran...')} />
  }

  if (pageError || !order || !payment) {
    return (
      <div className="min-h-screen bg-gray-50 text-black">
        <div className="container mx-auto px-4 pt-24 lg:pt-28 pb-12">
          <div className="max-w-xl mx-auto bg-white rounded-xl border border-red-200 p-6">
            <p className="text-red-700">{pageError || tr('Payment data unavailable', 'Data pembayaran tidak tersedia')}</p>
            <Link href="/cart" className="inline-flex mt-4 text-sm text-black hover:underline">
              {tr('Back to cart', 'Kembali ke keranjang')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const totalAmount = Number(order.total || 0)
  const transferProviderName = paymentMethodConfig?.provider_name || paymentMethodConfig?.display_name || '-'
  const transferAccountName = paymentMethodConfig?.account_name || '-'
  const transferAccountNumber = paymentMethodConfig?.account_number || '-'
  const transferInstructions = paymentMethodConfig?.instructions || ''

  // Unpaid orders with no proof are cancelled after this, releasing their stock.
  const showPaymentDeadline =
    order.status === 'pending' && order.payment_status !== 'paid' && !payment?.payment_proof_url
  const paymentDeadline = new Date(
    new Date(order.created_at).getTime() + UNPAID_ORDER_EXPIRY_HOURS * 60 * 60 * 1000
  ).toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      <div className="container mx-auto px-4 pt-24 lg:pt-28 pb-12">
        <div className="max-w-4xl mx-auto space-y-6">
          <Link href="/cart" className="inline-flex items-center gap-2 text-gray-600 hover:text-black transition">
            <ArrowLeft className="w-5 h-5" />
            {tr('Back to Cart', 'Kembali ke Keranjang')}
          </Link>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-black">{tr('Complete Payment', 'Selesaikan Pembayaran')}</h1>
            <p className="text-gray-600 mt-2">
              {tr('Order Number', 'Nomor Pesanan')}: <span className="font-mono font-medium text-black">{order.order_number}</span>
            </p>
            <p className="text-gray-600">
              {tr('Total Amount', 'Total Pembayaran')}: <span className="font-semibold text-black">{formatPrice(totalAmount)}</span>
            </p>
            {showPaymentDeadline && (
              <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                {tr(
                  'Please pay and upload your proof before {deadline}, otherwise this order is cancelled automatically.',
                  'Selesaikan pembayaran dan upload bukti sebelum {deadline}. Jika lewat, pesanan dibatalkan otomatis.',
                  { deadline: paymentDeadline }
                )}
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {paymentMethodConfig?.code === 'qris' ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5" />
                  {tr('QRIS Payment', 'Pembayaran QRIS')}
                </h2>

                <div className="rounded-lg border border-gray-300 bg-gray-50 p-6 w-full flex flex-col items-center gap-4">
                  <img src="/qris/bearion-qris.jpeg" alt={tr('QRIS payment code', 'Kode pembayaran QRIS')} className="max-w-xs w-full h-auto" />
                  <p className="text-sm text-gray-700 text-center">{tr('Scan this QR with your banking or e-wallet app to pay the exact amount.', 'Scan QR ini dengan aplikasi perbankan atau dompet digital untuk melakukan pembayaran.')}</p>
                  <p className="text-sm text-gray-500">{tr('After paying, upload your payment proof below so admin can verify and process your order.', 'Setelah membayar, upload bukti pembayaran di bawah agar admin bisa memverifikasi dan memproses pesanan Anda.')}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5" />
                  {tr('Transfer Destination', 'Tujuan Transfer')}
                </h2>

                <div className="space-y-3 rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <div>
                    <p className="text-xs text-gray-500">{tr('Bank', 'Bank')}</p>
                    <p className="font-semibold text-black">{transferProviderName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{tr('Account Name', 'Nama Rekening')}</p>
                    <p className="font-semibold text-black">{transferAccountName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{tr('Account Number', 'Nomor Rekening')}</p>
                    <p className="text-xl font-bold tracking-wide text-black">{transferAccountNumber}</p>
                  </div>
                </div>

                {transferInstructions && (
                  <div className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 whitespace-pre-line">
                    {transferInstructions}
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-4">
                  {tr(
                    'Transfer first, then upload your proof below so the order can be processed by admin.',
                    'Silakan transfer terlebih dahulu, lalu upload bukti agar pesanan dapat diproses admin.'
                  )}
                </p>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <FileUp className="w-5 h-5" />
                {tr('Upload Payment Proof', 'Upload Bukti Pembayaran')}
              </h2>

              <div className="space-y-3">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => handleSelectFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
                />
                <p className="text-xs text-gray-500">
                  {tr('Accepted: JPG, PNG, WEBP, PDF. Max size: 2MB.', 'Format: JPG, PNG, WEBP, PDF. Maksimal ukuran: 2MB.')}
                </p>

                {selectedFile && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {selectedFile.name}
                  </div>
                )}

                {fileError && (
                  <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">
                    {fileError}
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-lg border border-green-300 bg-green-50 text-green-700 px-3 py-2 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {successMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleUploadProof}
                  disabled={!selectedFile || uploading}
                  className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
                >
                  {uploading
                    ? tr('Uploading...', 'Mengupload...')
                    : tr('Upload Proof', 'Upload Bukti')}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-3">{tr('Latest Uploaded Proof', 'Bukti Terupload Terakhir')}</h2>

            {payment.proof_verification_status && (
              <div className="mb-4 p-4 rounded-lg border-l-4" style={{
                borderColor: payment.proof_verification_status === 'verified' ? '#10b981' : 
                             payment.proof_verification_status === 'rejected' ? '#ef4444' : 
                             '#eab308',
                backgroundColor: payment.proof_verification_status === 'verified' ? '#f0fdf4' : 
                                  payment.proof_verification_status === 'rejected' ? '#fef2f2' : 
                                  '#fffbeb'
              }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{
                      color: payment.proof_verification_status === 'verified' ? '#059669' : 
                             payment.proof_verification_status === 'rejected' ? '#dc2626' : 
                             '#ca8a04'
                    }}>
                      {payment.proof_verification_status === 'verified' 
                        ? tr('✓ Verified', '✓ Terverifikasi')
                        : payment.proof_verification_status === 'rejected'
                        ? tr('✗ Rejected', '✗ Ditolak')
                        : tr('⏳ Pending Verification', '⏳ Menunggu Verifikasi')}
                    </p>
                    {payment.proof_verification_status === 'rejected' && (
                      <div className="text-xs mt-1" style={{color: '#dc2626'}}>
                        <p>{tr('Please submit a new payment proof', 'Silakan submit bukti pembayaran baru')}</p>
                        {rejectionReason && (
                          <p className="mt-1">
                            {tr('Reason', 'Alasan')}: {rejectionReason}
                          </p>
                        )}
                      </div>
                    )}
                    {payment.proof_verification_status === 'verified' && (
                      <p className="text-xs mt-1" style={{color: '#059669'}}>
                        {payment.proof_verified_at && (
                          <>
                            {tr('Verified on', 'Diverifikasi pada')}: {new Date(payment.proof_verified_at).toLocaleDateString('id-ID')}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {payment.payment_proof_url ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                  {!proofSignedUrl ? (
                    <div className="flex items-center gap-3 text-gray-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                      <span>{tr('Loading proof...', 'Memuat bukti...')}</span>
                    </div>
                  ) : isProofImage ? (
                    <img
                      src={proofSignedUrl}
                      alt={tr('Payment proof preview', 'Preview bukti pembayaran')}
                      className="max-h-80 max-w-full w-auto rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="flex items-center gap-3 text-gray-700">
                      <ReceiptText className="w-5 h-5" />
                      <span>{tr('PDF proof uploaded', 'Bukti PDF sudah diupload')}</span>
                    </div>
                  )}
                </div>

                {proofSignedUrl && (
                  <a
                    href={proofSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {tr('Open uploaded proof', 'Buka bukti yang diupload')}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-gray-600 text-sm">
                {tr('No proof uploaded yet.', 'Belum ada bukti yang diupload.')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
