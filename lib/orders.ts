import { supabase } from './supabase'
import type { Order, OrderItem } from './supabase'

export const orderService = {
  /**
   * Create an order from the signed-in user's cart.
   *
   * Prices, totals, and the item list are deliberately absent from the payload:
   * the server rebuilds all of them from the database. The payment record is
   * created in the same request, so callers no longer create one separately.
   */
  async createOrder(orderData: {
    shippingAddressId: string
    paymentMethod: string
    customerNotes?: string
    /** Courier service the customer picked. Re-priced server-side before charging. */
    courierCode?: string
    serviceCode?: string
  }): Promise<Order> {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(orderData),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create order')
      }

      return result.order as Order
    } catch (error) {
      console.error('Error creating order:', error)
      throw error
    }
  },

  // Get user orders
  async getUserOrders(userId: string): Promise<Order[]> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('Error getting user orders:', error)
      throw error
    }
  },

  // Get order by ID
  async getOrderById(orderId: string): Promise<Order | null> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error getting order:', error)
      return null
    }
  },

  /**
   * Cancel the signed-in user's own order while it is still 'pending'.
   * Server-side re-checks ownership and status; the client never controls that.
   */
  async cancelOrder(orderNumber: string): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) throw new Error('Not authenticated')

    const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.message || 'Failed to cancel order')
    }
  },

  // Get order by order number
  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error getting order:', error)
      return null
    }
  },

  // Get order items
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('Error getting order items:', error)
      throw error
    }
  },

  /** Admin cancel: server-side so the stock reserved at checkout is restored. */
  async cancelOrderAsAdmin(orderId: string): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) throw new Error('Not authenticated')

    const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.message || 'Gagal membatalkan pesanan')
    }
  },

  // Update order status
  async updateOrderStatus(
    orderId: string,
    status: Order['status']
  ): Promise<Order> {
    try {
      if (status === 'cancelled') {
        await this.cancelOrderAsAdmin(orderId)

        const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single()
        if (error) throw error
        return data
      }

      const requiresProof = ['processing', 'shipped', 'delivered'].includes(status)

      if (requiresProof) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('payment_method')
          .eq('id', orderId)
          .single()

        const paymentMethodCode = orderData?.payment_method || ''
        let methodRequiresProof = paymentMethodCode === 'bank_transfer'

        if (paymentMethodCode) {
          const { data: methodConfig } = await supabase
            .from('payment_methods')
            .select('requires_proof')
            .eq('code', paymentMethodCode)
            .maybeSingle()

          if (typeof methodConfig?.requires_proof === 'boolean') {
            methodRequiresProof = methodConfig.requires_proof
          }
        }

        if (methodRequiresProof) {
          const { data: paymentData } = await supabase
            .from('payments')
            .select('payment_proof_url')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!paymentData?.payment_proof_url) {
            throw new Error('PAYMENT_PROOF_REQUIRED')
          }
        }
      }

      const updateData: Record<string, string> = { status }

      // Set timestamp based on status
      if (status === 'confirmed') {
        updateData.confirmed_at = new Date().toISOString()
      } else if (status === 'shipped') {
        updateData.shipped_at = new Date().toISOString()
      } else if (status === 'delivered') {
        updateData.delivered_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error updating order status:', error)
      throw error
    }
  },

  // Update payment status
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: Order['payment_status']
  ): Promise<Order> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ payment_status: paymentStatus })
        .eq('id', orderId)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error updating payment status:', error)
      throw error
    }
  },

  // Update tracking info
  async updateTrackingInfo(
    orderId: string,
    trackingNumber: string,
    courier: string,
    estimatedDelivery?: string
  ): Promise<Order> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          tracking_number: trackingNumber,
          courier,
          estimated_delivery: estimatedDelivery || null,
        })
        .eq('id', orderId)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error updating tracking info:', error)
      throw error
    }
  },

  /** Books a real Biteship shipment for a paid order and returns the waybill number. */
  async createBiteshipShipment(orderId: string): Promise<{
    tracking_number: string | null
    biteship_order_id: string | null
    biteship_status: string | null
  }> {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) throw new Error('Not authenticated')

    const response = await fetch(`/api/admin/orders/${orderId}/shipment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.message || 'Gagal membuat pengiriman')
    }

    return result.order
  },

  // Get all orders (admin)
  async getAllOrders(
    filters?: {
      status?: Order['status']
      paymentStatus?: Order['payment_status']
      limit?: number
    }
  ): Promise<Order[]> {
    try {
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      if (filters?.paymentStatus) {
        query = query.eq('payment_status', filters.paymentStatus)
      }

      if (filters?.limit) {
        query = query.limit(filters.limit)
      }

      const { data, error } = await query

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('Error getting all orders:', error)
      throw error
    }
  },
}
