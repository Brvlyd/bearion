import { supabase } from './supabase'
import type { Payment } from './supabase'

const MAX_PAYMENT_PROOF_SIZE = 2 * 1024 * 1024
const ALLOWED_PAYMENT_PROOF_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]
const PAYMENT_PROOF_BUCKET = process.env.NEXT_PUBLIC_PAYMENT_PROOF_BUCKET || 'uploads'

const isProofVerificationMetadataError = (error: unknown): boolean => {
  const message = String((error as { message?: string })?.message || '').toLowerCase()
  return (
    message.includes('proof_verification_status') ||
    message.includes('proof_verified_by') ||
    message.includes('proof_verified_at') ||
    message.includes('pgrst204')
  )
}

export const paymentService = {
  // Create payment record
  async createPayment(paymentData: {
    orderId: string
    paymentMethod: string
    amount: number
    paymentGateway?: string
  }): Promise<Payment> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          order_id: paymentData.orderId,
          payment_method: paymentData.paymentMethod,
          amount: paymentData.amount,
          payment_gateway: paymentData.paymentGateway || null,
          status: 'pending',
        })
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error creating payment:', error)
      throw error
    }
  },

  // Update payment status
  async updatePaymentStatus(
    paymentId: string,
    status: Payment['status'],
    additionalData?: {
      transactionId?: string
      paidAt?: string
      gatewayResponse?: unknown
    }
  ): Promise<Payment> {
    try {
      const updateData: Record<string, unknown> = { status }

      if (additionalData?.transactionId) {
        updateData.transaction_id = additionalData.transactionId
      }

      if (additionalData?.paidAt) {
        updateData.paid_at = additionalData.paidAt
      }

      if (additionalData?.gatewayResponse) {
        updateData.gateway_response = additionalData.gatewayResponse
      }

      if (status === 'success' && !updateData.paid_at) {
        updateData.paid_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', paymentId)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error updating payment status:', error)
      throw error
    }
  },

  // Get payment by order ID
  async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data
    } catch (error) {
      console.error('Error getting payment:', error)
      return null
    }
  },

  /**
   * Upload payment proof and return its storage path (not a public URL). The
   * caller records it on the payment row together with the status change, in a
   * single write — see submitPaymentProof. The uploads bucket is private — proof images can show a bank
   * account number and the customer's full name — so viewing one always goes
   * through paymentService.getPaymentProofSignedUrl() rather than a bare link.
   * There's no bucket fallback: silently dropping a proof into a public
   * bucket if the private one is misconfigured would defeat the point, so
   * this fails loudly instead.
   */
  async uploadPaymentProof(
    paymentId: string,
    file: File
  ): Promise<string> {
    try {
      if (!ALLOWED_PAYMENT_PROOF_TYPES.includes(file.type)) {
        throw new Error('INVALID_PAYMENT_PROOF_TYPE')
      }

      if (file.size > MAX_PAYMENT_PROOF_SIZE) {
        throw new Error('PAYMENT_PROOF_TOO_LARGE')
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${paymentId}-${Date.now()}.${fileExt}`
      const filePath = `payment-proofs/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(PAYMENT_PROOF_BUCKET)
        .upload(filePath, file)

      if (uploadError) throw uploadError

      return filePath
    } catch (error) {
      console.error('Error uploading payment proof:', error)
      throw error
    }
  },

  /** Short-lived (5 min) viewable URL for a payment's proof. Server checks ownership. */
  async getPaymentProofSignedUrl(paymentId: string): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) throw new Error('Not authenticated')

    const response = await fetch('/api/payment-proofs/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ paymentId }),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(body.message || 'Failed to load payment proof')
    }

    return body.url as string
  },

  // Submit proof for manual transfer and mark payment as waiting for admin verification
  async submitPaymentProof(orderId: string, file: File): Promise<Payment> {
    try {
      const PAYMENT_REJECTION_PREFIX = '[PAYMENT_REJECTION]'
      const payment = await this.getPaymentByOrderId(orderId)

      if (!payment) {
        throw new Error('PAYMENT_NOT_FOUND')
      }

      // Stored in the same UPDATE as status 'processing' below. Two separate
      // writes left a window (a dropped connection in between) where the proof
      // was saved but the payment still looked unpaid, so the order could be
      // cancelled or expired with the customer's money already sent.
      const proofPath = await this.uploadPaymentProof(payment.id, file)

      // Clear previous rejection notice after user uploads a new proof.
      const { data: orderMeta } = await supabase
        .from('orders')
        .select('admin_notes')
        .eq('id', orderId)
        .maybeSingle()

      if (orderMeta?.admin_notes?.startsWith(PAYMENT_REJECTION_PREFIX)) {
        await supabase
          .from('orders')
          .update({ admin_notes: null })
          .eq('id', orderId)
      }

      try {
        const { data, error } = await supabase
          .from('payments')
          .update({
            status: 'processing',
            payment_proof_url: proofPath,
            proof_verification_status: 'pending',
            proof_verified_by: null,
            proof_verified_at: null,
          })
          .eq('id', payment.id)
          .select()
          .single()

        if (error) throw error

        return data
      } catch (metadataError) {
        if (isProofVerificationMetadataError(metadataError)) {
          // Fallback for databases that haven't added proof verification columns yet.
          const { data, error } = await supabase
            .from('payments')
            .update({ status: 'processing', payment_proof_url: proofPath })
            .eq('id', payment.id)
            .select()
            .single()

          if (error) throw error
          return data
        }

        throw metadataError
      }
    } catch (error) {
      console.error('Error submitting payment proof:', error)
      throw error
    }
  },

  // Process manual bank transfer
  async processManualTransfer(
    orderId: string,
    amount: number,
    bankName: string,
    accountNumber: string
  ): Promise<Payment> {
    try {
      const payment = await this.createPayment({
        orderId,
        paymentMethod: 'bank_transfer',
        amount,
        paymentGateway: 'manual',
      })

      // Update payment with bank details
      const { data, error } = await supabase
        .from('payments')
        .update({
          gateway_response: {
            bank_name: bankName,
            account_number: accountNumber,
          },
        })
        .eq('id', payment.id)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error processing manual transfer:', error)
      throw error
    }
  },

  // Verify payment (admin)
  async verifyPayment(paymentId: string, verified: boolean): Promise<void> {
    try {
      const status = verified ? 'success' : 'failed'
      await this.updatePaymentStatus(paymentId, status, {
        paidAt: verified ? new Date().toISOString() : undefined,
      })

      // Update order payment status
      const payment = await supabase
        .from('payments')
        .select('order_id')
        .eq('id', paymentId)
        .single()

      if (payment.data) {
        await supabase
          .from('orders')
          .update({ payment_status: verified ? 'paid' : 'failed' })
          .eq('id', payment.data.order_id)
      }
    } catch (error) {
      console.error('Error verifying payment:', error)
      throw error
    }
  },
}
