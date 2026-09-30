'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Truck, CheckCircle, Copy, Check, Gift, Globe, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cartService } from '@/lib/cart'
import { orderService } from '@/lib/orders'
import { shippingService } from '@/lib/shipping'
import { loadActivePaymentMethods } from '@/lib/payment-methods'
import { notificationService } from '@/lib/notifications'
import { formatIdrAmount, getEffectiveIdrPrice, getIdrPrice } from '@/lib/price'
import { useIdrPerUsdRate } from '@/lib/use-fx-rate'
import { SHIPPING_ENABLED, TAX_ENABLED, TAX_RATE } from '@/lib/store-config'
import {
  findRegionByName,
  getDisplayRegionName,
  wilayahService,
  type WilayahOption,
} from '@/lib/wilayah'
import {
  fetchShippingRates,
  type ShippingNearMiss,
  type ShippingRateOption,
} from '@/lib/shipping-client'
import { describeNearMiss } from '@/lib/promotions'
import { COUNTRIES, countryName, isIndonesia, requiresPostalCode } from '@/lib/countries'
import { useLanguage } from '@/lib/i18n'
import { useDialog } from '@/lib/dialog'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal'
import LoadingSpinner from '@/components/LoadingSpinner'
import PayPalCheckoutButton from '@/components/PayPalCheckoutButton'
import type {
  AppliedPromotion,
  CartItem,
  ShippingAddress,
  PaymentMethodConfig,
  Order,
} from '@/lib/supabase'

type Step = 'shipping' | 'payment' | 'review'

const EMPTY_ADDRESS_FORM = {
  recipient_name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  province: '',
  district: '',
  postal_code: '',
  country: 'Indonesia',
  country_code: 'ID',
  label: 'Home',
  is_default: false,
}

export default function CheckoutPage() {
  const router = useRouter()
  const { tr, language } = useLanguage()
  const { alertDialog } = useDialog()
  const idrPerUsd = useIdrPerUsdRate()
  const [currentStep, setCurrentStep] = useState<Step>('shipping')
  const [userId, setUserId] = useState<string | null>(null)
  
  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  
  // Shipping
  const [addresses, setAddresses] = useState<ShippingAddress[]>([])
  const [selectedAddress, setSelectedAddress] = useState<ShippingAddress | null>(null)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState({ ...EMPTY_ADDRESS_FORM })
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [addressFormError, setAddressFormError] = useState('')
  const [savingAddress, setSavingAddress] = useState(false)
  const [provinceOptions, setProvinceOptions] = useState<WilayahOption[]>([])
  const [regencyOptions, setRegencyOptions] = useState<WilayahOption[]>([])
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('')
  const [selectedRegencyCode, setSelectedRegencyCode] = useState('')
  const [regionError, setRegionError] = useState('')
  const [loadingProvinces, setLoadingProvinces] = useState(false)
  const [loadingRegencies, setLoadingRegencies] = useState(false)

  // Live courier rates for the selected address
  const [shippingOptions, setShippingOptions] = useState<ShippingRateOption[]>([])
  const [selectedShippingKey, setSelectedShippingKey] = useState('')
  const [loadingRates, setLoadingRates] = useState(false)
  const [ratesError, setRatesError] = useState('')
  const [nearMisses, setNearMisses] = useState<ShippingNearMiss[]>([])
  const [customsNote, setCustomsNote] = useState<{ en: string; id: string } | null>(null)
  const [parcelWeightGrams, setParcelWeightGrams] = useState(0)
  // Merchandise-level promotions, the only ones that still apply while ongkir is
  // hidden. Kept separate so the courier path keeps reading them off its option.
  const [cartDiscount, setCartDiscount] = useState(0)
  const [cartPromotions, setCartPromotions] = useState<AppliedPromotion[]>([])

  // Payment
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([])
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [paymentMethodError, setPaymentMethodError] = useState('')
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false)
  const [copiedValue, setCopiedValue] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [pendingPaypalOrder, setPendingPaypalOrder] = useState<Order | null>(null)
  
  // Processing
  const [processing, setProcessing] = useState(false)

  // Delete address modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [addressToDelete, setAddressToDelete] = useState<ShippingAddress | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    void loadProvinces()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login?redirect=/checkout')
      return
    }

    setUserId(user.id)
    await Promise.all([
      loadData(user.id),
      loadPaymentMethods(),
    ])
  }

  const loadPaymentMethods = async () => {
    try {
      setLoadingPaymentMethods(true)
      setPaymentMethodError('')

      const result = await loadActivePaymentMethods()
      setPaymentMethods(result.methods)

      if (result.methods.length > 0) {
        setPaymentMethod((prev) =>
          prev || result.methods.find((m) => m.code === 'qris')?.code || result.methods[0].code
        )
      }

      if (result.tableMissing) {
        setPaymentMethodError(
          tr(
            'Payment methods table not found. Using default payment method.',
            'Tabel metode pembayaran tidak ditemukan. Menggunakan metode pembayaran default.'
          )
        )
      } else if (result.error) {
        setPaymentMethodError(
          tr(
            'Failed to load payment methods. Using fallback.',
            'Gagal memuat metode pembayaran. Menggunakan fallback.'
          )
        )
      }
    } catch (error) {
      console.error('Error loading payment methods:', error)
      setPaymentMethodError(
        tr(
          'Failed to load payment methods. Using fallback.',
          'Gagal memuat metode pembayaran. Menggunakan fallback.'
        )
      )
    } finally {
      setLoadingPaymentMethods(false)
    }
  }

  const loadData = async (uid: string) => {
    try {
      setLoading(true)
      const [items, userAddresses] = await Promise.all([
        cartService.getCartItems(uid),
        shippingService.getUserAddresses(uid),
      ])

      if (items.length === 0) {
        router.push('/cart')
        return
      }

      setCartItems(items)
      setAddresses(userAddresses)

      // Select default address or first address
      const defaultAddr = userAddresses.find((a) => a.is_default) || userAddresses[0]
      setSelectedAddress(defaultAddr || null)
    } catch (error) {
      console.error('Error loading checkout data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProvinces = async (): Promise<WilayahOption[]> => {
    try {
      setLoadingProvinces(true)
      setRegionError('')
      const provinces = await wilayahService.getProvinces()
      setProvinceOptions(provinces)
      return provinces
    } catch (error) {
      console.error('Error loading provinces:', error)
      setRegionError(tr('Failed to load province data', 'Gagal memuat data provinsi'))
      return []
    } finally {
      setLoadingProvinces(false)
    }
  }

  const loadRegencies = async (provinceCode: string): Promise<WilayahOption[]> => {
    try {
      setLoadingRegencies(true)
      setRegionError('')
      const regencies = await wilayahService.getRegencies(provinceCode)
      setRegencyOptions(regencies)
      return regencies
    } catch (error) {
      console.error('Error loading regencies:', error)
      setRegionError(tr('Failed to load city data', 'Gagal memuat data kota/kabupaten'))
      setRegencyOptions([])
      return []
    } finally {
      setLoadingRegencies(false)
    }
  }

  // Ongkir is quoted by the server for the chosen address. The browser never
  // computes a price — it only renders what came back and remembers the pick.
  const loadShippingRates = useCallback(
    async (addressId: string) => {
      try {
        setLoadingRates(true)
        setRatesError('')

        const result = await fetchShippingRates(addressId)

        setNearMisses(result.nearMisses)
        setCartDiscount(result.cartDiscount)
        setCartPromotions(result.cartPromotions)

        // With ongkir hidden the call is only worth its promotions: no courier
        // list, and nothing to complain about when no courier serves the address.
        if (!SHIPPING_ENABLED) {
          setShippingOptions([])
          setSelectedShippingKey('')
          setCustomsNote(null)
          setParcelWeightGrams(0)
          return
        }

        setShippingOptions(result.options)
        setCustomsNote(result.customsNote)
        setParcelWeightGrams(result.parcel?.weightGrams || 0)

        if (result.options.length === 0) {
          setSelectedShippingKey('')
          setRatesError(
            result.message ||
              tr(
                'No courier service is available for this address.',
                'Tidak ada layanan pengiriman untuk alamat ini.'
              )
          )
          return
        }

        // Keep the customer's choice across a re-quote when it is still offered,
        // otherwise default to the cheapest (the API returns them sorted).
        setSelectedShippingKey((previous) =>
          result.options.some((option) => option.key === previous)
            ? previous
            : result.options[0].key
        )
      } catch (error) {
        console.error('Error loading shipping rates:', error)
        setShippingOptions([])
        setSelectedShippingKey('')
        setCartDiscount(0)
        setCartPromotions([])

        // Nothing is quoted while ongkir is hidden, so a failure here costs the
        // customer at most a promotion line — never a blocked checkout.
        if (SHIPPING_ENABLED) {
          setRatesError(
            tr('Failed to calculate shipping cost.', 'Gagal menghitung ongkos kirim.')
          )
        }
      } finally {
        setLoadingRates(false)
      }
    },
    [tr]
  )

  useEffect(() => {
    if (!selectedAddress?.id || cartItems.length === 0) {
      setShippingOptions([])
      setSelectedShippingKey('')
      setCartDiscount(0)
      setCartPromotions([])
      return
    }

    void loadShippingRates(selectedAddress.id)
  }, [selectedAddress?.id, cartItems.length, loadShippingRates])

  // Scroll the address form into view once it renders, so the user notices
  // it opened instead of wondering why nothing happened after clicking Edit.
  useEffect(() => {
    if (showAddressForm) {
      document.getElementById('address-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showAddressForm, editingAddressId])

  const resetAddressForm = () => {
    setNewAddress({ ...EMPTY_ADDRESS_FORM })
    setEditingAddressId(null)
    setAddressFormError('')
    setRegionError('')
    setSelectedProvinceCode('')
    setSelectedRegencyCode('')
    setRegencyOptions([])
  }

  const handleStartAddAddress = async () => {
    if (addresses.length >= 3) {
      setAddressFormError(tr('Maximum 3 addresses per user', 'Maksimal 3 alamat per user'))
      return
    }

    if (provinceOptions.length === 0) {
      await loadProvinces()
    }

    resetAddressForm()
    setShowAddressForm(true)
  }

  const handleStartEditAddress = async (address: ShippingAddress) => {
    const provinces = provinceOptions.length > 0 ? provinceOptions : await loadProvinces()
    const matchedProvince = findRegionByName(provinces, address.province)

    setEditingAddressId(address.id)
    setAddressFormError('')
    setRegionError('')
    setNewAddress({
      recipient_name: address.recipient_name,
      phone: address.phone,
      address_line1: address.address_line1,
      address_line2: address.address_line2 || '',
      city: address.city,
      province: address.province,
      district: address.district || '',
      postal_code: address.postal_code || '',
      country: address.country,
      country_code: (address.country_code || 'ID').toUpperCase(),
      label: address.label || 'Home',
      is_default: address.is_default,
    })

    if (matchedProvince) {
      setSelectedProvinceCode(matchedProvince.code)
      const regencies = await loadRegencies(matchedProvince.code)
      const matchedRegency = findRegionByName(regencies, address.city)
      setSelectedRegencyCode(matchedRegency?.code || '')
    } else {
      setSelectedProvinceCode('')
      setSelectedRegencyCode('')
      setRegencyOptions([])
    }

    setShowAddressForm(true)
  }

  const handleProvinceChange = async (provinceCode: string) => {
    const selectedProvince = provinceOptions.find((province) => province.code === provinceCode)

    setSelectedProvinceCode(provinceCode)
    setSelectedRegencyCode('')
    setRegencyOptions([])
    setNewAddress((prev) => ({
      ...prev,
      province: selectedProvince?.name || '',
      city: '',
      postal_code: '',
    }))

    if (provinceCode) {
      await loadRegencies(provinceCode)
    }
  }

  const handleRegencyChange = (regencyCode: string) => {
    const selectedRegency = regencyOptions.find((regency) => regency.code === regencyCode)

    setSelectedRegencyCode(regencyCode)
    setNewAddress((prev) => ({
      ...prev,
      city: selectedRegency ? getDisplayRegionName(selectedRegency.name) : '',
      postal_code: '',
    }))
  }

  // Switching country swaps the whole regional model: Indonesian addresses use
  // the wilayah dropdowns, everything else is free text (a "province" abroad is
  // a state, a county, or nothing at all).
  const handleCountryChange = (code: string) => {
    const country = COUNTRIES.find((entry) => entry.code === code)

    setSelectedProvinceCode('')
    setSelectedRegencyCode('')
    setRegencyOptions([])
    setNewAddress((prev) => ({
      ...prev,
      country_code: code,
      country: country?.name || code,
      province: '',
      city: '',
      district: '',
      postal_code: '',
    }))
  }

  const handleSaveAddress = async () => {
    if (!userId) return

    const domestic = isIndonesia(newAddress.country_code)
    const postalRequired = requiresPostalCode(newAddress.country_code)

    if (
      !newAddress.recipient_name.trim() ||
      !newAddress.phone.trim() ||
      !newAddress.address_line1.trim() ||
      !newAddress.city.trim() ||
      !newAddress.province.trim()
    ) {
      setAddressFormError(tr('Please fill all address fields', 'Mohon isi semua field alamat'))
      return
    }

    // A street detail line is what makes a domestic parcel findable; abroad the
    // city/state/postcode triple carries that weight instead.
    if (domestic && !newAddress.address_line2.trim()) {
      setAddressFormError(
        tr(
          'Please fill in Address Line 2 (RT/RW, block, or landmark) — couriers need it to find domestic addresses.',
          'Mohon isi Alamat Baris 2 (RT/RW, blok, atau patokan) — kurir butuh ini untuk menemukan alamat domestik.'
        )
      )
      return
    }

    if (postalRequired && !newAddress.postal_code.trim()) {
      setAddressFormError(tr('Postal code is required', 'Kode pos wajib diisi'))
      return
    }

    if (domestic && !/^\d{5}$/.test(newAddress.postal_code.trim())) {
      setAddressFormError(tr('Postal code must be 5 digits', 'Kode pos harus 5 digit'))
      return
    }

    if (addresses.length >= 3 && !editingAddressId) {
      setAddressFormError(tr('Maximum 3 addresses per user', 'Maksimal 3 alamat per user'))
      return
    }

    try {
      setSavingAddress(true)
      setAddressFormError('')
      let targetAddressId = editingAddressId

      const payload = {
        ...newAddress,
        country_code: newAddress.country_code.toUpperCase(),
        district: newAddress.district.trim() || null,
        // Empty string would defeat the nullable column for postcode-less countries.
        postal_code: newAddress.postal_code.trim() || null,
      }

      if (editingAddressId) {
        await shippingService.updateAddress(editingAddressId, userId, payload)
      } else {
        const createdAddress = await shippingService.createAddress(userId, payload)
        targetAddressId = createdAddress.id
      }

      const refreshedAddresses = await shippingService.getUserAddresses(userId)
      const nextSelectedAddress = targetAddressId
        ? refreshedAddresses.find((address) => address.id === targetAddressId)
        : refreshedAddresses.find((address) => address.is_default) || refreshedAddresses[0]

      // Editing the address that's already selected keeps its id unchanged, so
      // the [selectedAddress?.id] effect below won't re-fire on its own — quote
      // it here explicitly instead of leaving the old rate on screen.
      const wasEditingCurrentSelection = Boolean(editingAddressId) && selectedAddress?.id === editingAddressId

      setAddresses(refreshedAddresses)
      setSelectedAddress(nextSelectedAddress || null)
      setShowAddressForm(false)
      resetAddressForm()

      if (wasEditingCurrentSelection && nextSelectedAddress) {
        void loadShippingRates(nextSelectedAddress.id)
      }
    } catch (error) {
      console.error('Error saving address:', error)

      const message = error instanceof Error ? error.message : ''
      if (message.includes('MAX_ADDRESSES_REACHED')) {
        setAddressFormError(tr('Maximum 3 addresses per user', 'Maksimal 3 alamat per user'))
      } else {
        setAddressFormError(tr('Failed to save address', 'Gagal menyimpan alamat'))
      }
    } finally {
      setSavingAddress(false)
    }
  }

  const handleDeleteAddress = async (address: ShippingAddress) => {
    // Open the modal
    setAddressToDelete(address)
    setDeleteModalOpen(true)
  }

  const confirmDeleteAddress = async () => {
    if (!userId || !addressToDelete) return

    try {
      await shippingService.deleteAddress(addressToDelete.id, userId)

      const refreshedAddresses = await shippingService.getUserAddresses(userId)
      setAddresses(refreshedAddresses)

      if (selectedAddress?.id === addressToDelete.id) {
        const defaultAddr = refreshedAddresses.find((address) => address.is_default) || refreshedAddresses[0]
        setSelectedAddress(defaultAddr || null)
      }

      if (editingAddressId === addressToDelete.id) {
        setShowAddressForm(false)
        resetAddressForm()
      }

      setDeleteModalOpen(false)
      setAddressToDelete(null)
    } catch (error) {
      console.error('Error deleting address:', error)
      const message = error instanceof Error ? error.message : ''

      if (message.includes('ADDRESS_DELETE_NOT_ALLOWED')) {
        setAddressFormError(
          tr(
            'You do not have permission to delete this address.',
            'Anda tidak memiliki izin untuk menghapus alamat ini.'
          )
        )
      } else if (message.includes('ADDRESS_DELETE_REQUIRES_DB_MIGRATION')) {
        setAddressFormError(
          tr(
            'Address deletion for previous orders needs database migration. Run allow-delete-used-shipping-address.sql in Supabase SQL Editor.',
            'Penghapusan alamat yang pernah dipakai order memerlukan migration database. Jalankan allow-delete-used-shipping-address.sql di Supabase SQL Editor.'
          )
        )
      } else {
        setAddressFormError(tr('Failed to delete address', 'Gagal menghapus alamat'))
      }
      setDeleteModalOpen(false)
    }
  }

  const handleCopyAccountNumber = async (value: string) => {
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      setCopiedValue(value)
      setTimeout(() => setCopiedValue(''), 2000)
    } catch (error) {
      console.error('Failed to copy account number:', error)
      await alertDialog(tr('Failed to copy account number', 'Gagal menyalin nomor rekening'), { variant: 'error' })
    }
  }

  const handlePlaceOrder = async () => {
    if (!userId || !selectedAddress) return

    if (!paymentMethod) {
      await alertDialog(tr('Please select a payment method', 'Silakan pilih metode pembayaran'), { variant: 'error' })
      return
    }

    if (SHIPPING_ENABLED && !selectedShippingOption) {
      await alertDialog(tr('Please select a shipping service', 'Silakan pilih layanan pengiriman'), { variant: 'error' })
      setCurrentStep('shipping')
      return
    }

    const selectedMethod = paymentMethods.find((method) => method.code === paymentMethod)
    const isPaypal = selectedMethod?.code === 'paypal'

    try {
      setProcessing(true)

      // Totals and the item list are rebuilt server-side from the cart; the
      // amounts rendered below are display only.
      const order = await orderService.createOrder({
        shippingAddressId: selectedAddress.id,
        paymentMethod,
        customerNotes,
        courierCode: selectedShippingOption?.courierCode,
        serviceCode: selectedShippingOption?.serviceCode,
      })

      if (isPaypal) {
        // PayPal isn't paid yet — show the PayPal buttons and wait for a verified
        // capture before clearing the cart or leaving this page.
        setPendingPaypalOrder(order)
        return
      }

      // Send order confirmation email (best-effort — should never block checkout)
      notificationService
        .sendOrderConfirmationEmail(order.order_number)
        .catch((error) => console.error('Failed to send order confirmation email:', error))

      // Clear cart
      await cartService.clearCart(userId)

      if (selectedMethod?.requires_proof) {
        router.push(`/payment/${order.order_number}`)
      } else {
        router.push('/cart?checkout=success')
      }
    } catch (error) {
      console.error('Error placing order:', error)

      const message = error instanceof Error ? error.message : ''

      // The server re-quotes at order time, so a promo that expired or a courier
      // that dropped out mid-checkout lands here. Re-quote and let them re-pick
      // rather than charging a price they never agreed to.
      if (message.toLowerCase().includes('pengiriman')) {
        await alertDialog(message, { variant: 'error' })
        setCurrentStep('shipping')
        if (selectedAddress) void loadShippingRates(selectedAddress.id)
        return
      }

      // Someone else bought the last units after this cart was loaded. The cart
      // page shows which line is short, so send them there to adjust it.
      if (message.toLowerCase().includes('stok')) {
        await alertDialog(
          tr(
            'One of the products just sold out. Please review your cart.',
            'Stok salah satu produk baru saja habis. Periksa kembali keranjang Anda.'
          ),
          { variant: 'error' }
        )
        router.push('/cart')
        return
      }

      await alertDialog(tr('Failed to place order. Please try again.', 'Gagal membuat pesanan. Silakan coba lagi.'), {
        variant: 'error',
      })
    } finally {
      setProcessing(false)
    }
  }

  const handlePaypalSuccess = useCallback(() => {
    if (!pendingPaypalOrder || !userId) return

    notificationService
      .sendOrderConfirmationEmail(pendingPaypalOrder.order_number)
      .catch((error) => console.error('Failed to send order confirmation email:', error))

    cartService
      .clearCart(userId)
      .catch((error) => console.error('Failed to clear cart after PayPal payment:', error))
      .finally(() => {
        router.push('/cart?checkout=success')
      })
  }, [pendingPaypalOrder, userId, router])

  // Calculate totals. These mirror the server's arithmetic in
  // /api/orders/create for display only — the server recomputes everything and
  // rejects the order if the chosen service no longer exists.
  const subtotal = cartItems.reduce(
    (sum, item) => {
      const price = item.product ? getEffectiveIdrPrice(item.product) : 0
      return sum + price * item.quantity
    },
    0
  )
  // What the same cart would cost at list price, so a markdown reads as a saving.
  const originalSubtotal = cartItems.reduce(
    (sum, item) => {
      const price = item.product ? getIdrPrice(item.product) : 0
      return sum + price * item.quantity
    },
    0
  )
  const productSavings = Math.max(0, originalSubtotal - subtotal)
  const selectedShippingOption =
    shippingOptions.find((option) => option.key === selectedShippingKey) || null
  const shippingCost = SHIPPING_ENABLED ? selectedShippingOption?.finalCost ?? 0 : 0
  const shippingDiscount = selectedShippingOption?.discount ?? 0
  const orderDiscount = Math.min(
    SHIPPING_ENABLED ? selectedShippingOption?.orderDiscount ?? 0 : cartDiscount,
    subtotal
  )
  const taxableAmount = Math.max(0, subtotal - orderDiscount)
  const tax = TAX_ENABLED ? Math.round(taxableAmount * TAX_RATE * 100) / 100 : 0
  const total = taxableAmount + shippingCost + tax
  const appliedPromotions = SHIPPING_ENABLED
    ? selectedShippingOption?.appliedPromotions ?? []
    : cartPromotions

  const postalCodeSuggestions = Array.from(
    new Set(
      addresses
        .filter((address) =>
          address.city.toLowerCase() === newAddress.city.toLowerCase() &&
          address.province.toLowerCase() === newAddress.province.toLowerCase()
        )
        .map((address) => address.postal_code)
        .filter((postalCode): postalCode is string => Boolean(postalCode))
    )
  )
  const isAddressLimitReached = addresses.length >= 3 && !editingAddressId
  const isFormDomestic = isIndonesia(newAddress.country_code)
  const isFormPostalRequired = requiresPostalCode(newAddress.country_code)
  const selectedPaymentMethod = paymentMethods.find((method) => method.code === paymentMethod) || null

  // Shows the live USD estimate once the rate loads and the visitor is on the
  // English site; every price in this page (courier options, order summary)
  // goes through here so switching language switches all of them together.
  const formatPrice = (price: number) => formatIdrAmount(price, language, idrPerUsd)

  if (loading) {
    return <LoadingSpinner fullScreen label={tr('Loading checkout...', 'Memuat checkout...')} />
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      <div className="container mx-auto px-4 pt-24 lg:pt-28 pb-10">
        <div className="max-w-6xl mx-auto">
        {/* Header */}
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-black transition mb-4 lg:mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          {tr('Back to Cart', 'Kembali ke Keranjang')}
        </Link>

        <h1 className="text-2xl lg:text-3xl font-bold text-black mb-6 lg:mb-8">{tr('Checkout', 'Checkout')}</h1>

        {/* Progress Steps */}
        <div className="mb-6 lg:mb-8 flex items-center justify-center gap-2 lg:gap-4">
          <div className="flex items-center gap-1 lg:gap-2">
            <div className={`w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-sm ${currentStep === 'shipping' ? 'bg-black text-white' : 'bg-green-500 text-white'}`}>
              {currentStep !== 'shipping' ? <CheckCircle className="w-4 h-4 lg:w-5 lg:h-5" /> : '1'}
            </div>
            <span className="font-medium text-sm lg:text-base hidden sm:inline text-black">{tr('Shipping', 'Pengiriman')}</span>
          </div>
          <div className="w-6 lg:w-12 h-0.5 bg-gray-300"></div>
          <div className="flex items-center gap-1 lg:gap-2">
            <div className={`w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-sm ${currentStep === 'payment' ? 'bg-black text-white' : currentStep === 'review' ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
              {currentStep === 'review' ? <CheckCircle className="w-4 h-4 lg:w-5 lg:h-5" /> : '2'}
            </div>
            <span className={`font-medium text-sm lg:text-base hidden sm:inline ${currentStep === 'payment' || currentStep === 'review' ? 'text-black' : 'text-gray-500'}`}>
              {tr('Payment', 'Pembayaran')}
            </span>
          </div>
          <div className="w-6 lg:w-12 h-0.5 bg-gray-300"></div>
          <div className="flex items-center gap-1 lg:gap-2">
            <div className={`w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-sm ${currentStep === 'review' ? 'bg-black text-white' : 'bg-gray-300 text-gray-600'}`}>
              3
            </div>
            <span className={`font-medium text-sm lg:text-base hidden sm:inline ${currentStep === 'review' ? 'text-black' : 'text-gray-500'}`}>
              {tr('Review', 'Tinjau')}
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 lg:space-y-6">
            {/* Shipping Step */}
            {currentStep === 'shipping' && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
                <h2 className="text-xl font-semibold text-black mb-4 flex items-center gap-2">
                  <Truck className="w-6 h-6" />
                  {tr('Shipping Address', 'Alamat Pengiriman')}
                </h2>

                {/* Address List */}
                <div className="space-y-3 mb-4">
                  {addresses.length === 0 && (
                    <p className="text-sm text-gray-600">
                      {tr('No address saved yet. Please add one first.', 'Belum ada alamat tersimpan. Silakan tambahkan terlebih dahulu.')}
                    </p>
                  )}

                  {addresses.map((address) => (
                    <div
                      key={address.id}
                      onClick={() => setSelectedAddress(address)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                        selectedAddress?.id === address.id
                          ? 'border-black bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-black">{address.recipient_name}</p>
                          <p className="text-sm text-gray-600 mt-1">{address.phone}</p>
                          <p className="text-sm text-gray-600 mt-2">
                            {address.address_line1}
                            {address.address_line2 && `, ${address.address_line2}`}
                          </p>
                          <p className="text-sm text-gray-600">
                            {address.city}, {address.province} {address.postal_code || ''}
                          </p>
                          {!isIndonesia(address.country_code) && (
                            <p className="text-sm font-medium text-gray-700 inline-flex items-center gap-1 mt-0.5">
                              <Globe className="w-3.5 h-3.5" />
                              {countryName(address.country_code, language)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-start gap-2">
                          {address.is_default && (
                            <span className="text-xs bg-black text-white px-2 py-1 rounded">
                              {tr('Default', 'Utama')}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleStartEditAddress(address)
                            }}
                            className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                          >
                            {tr('Edit', 'Ubah')}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteAddress(address)
                            }}
                            className="text-xs px-2 py-1 border border-red-300 rounded text-red-600 hover:bg-red-50"
                          >
                            {tr('Delete', 'Hapus')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Address Form */}
                {showAddressForm ? (
                  <div id="address-form" className="border border-gray-200 rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold text-sm lg:text-base text-black">
                      {editingAddressId
                        ? tr('Edit Address', 'Ubah Alamat')
                        : tr('Add New Address', 'Tambah Alamat Baru')}
                    </h3>

                    {addressFormError && (
                      <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm px-3 py-2">
                        {addressFormError}
                      </div>
                    )}

                    {regionError && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm px-3 py-2">
                        {regionError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                      <input
                        type="text"
                        placeholder={tr('Recipient Name', 'Nama Penerima')}
                        value={newAddress.recipient_name}
                        onChange={(e) => setNewAddress({ ...newAddress, recipient_name: e.target.value })}
                        className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="tel"
                        placeholder={tr('Phone', 'Telepon')}
                        value={newAddress.phone}
                        onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                        className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="text"
                        placeholder={tr('Address Line 1', 'Alamat Baris 1')}
                        value={newAddress.address_line1}
                        onChange={(e) => setNewAddress({ ...newAddress, address_line1: e.target.value })}
                        className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="text"
                        placeholder={
                          isFormDomestic
                            ? tr('Address Line 2 (RT/RW, block, landmark)', 'Alamat Baris 2 (RT/RW, blok, patokan)')
                            : tr('Address Line 2 (optional)', 'Alamat Baris 2 (opsional)')
                        }
                        value={newAddress.address_line2}
                        onChange={(e) => setNewAddress({ ...newAddress, address_line2: e.target.value })}
                        className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                      />

                      <select
                        value={newAddress.country_code}
                        onChange={(e) => handleCountryChange(e.target.value)}
                        className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>
                            {countryName(country.code, language)}
                          </option>
                        ))}
                      </select>

                      {isFormDomestic ? (
                        <>
                          <select
                            value={selectedProvinceCode}
                            onChange={(e) => {
                              void handleProvinceChange(e.target.value)
                            }}
                            disabled={loadingProvinces}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="">
                              {newAddress.province && selectedProvinceCode === ''
                                ? `${tr('Current Province', 'Provinsi Saat Ini')}: ${newAddress.province}`
                                : tr('Select Province', 'Pilih Provinsi')}
                            </option>
                            {provinceOptions.map((province) => (
                              <option key={province.code} value={province.code}>
                                {province.name}
                              </option>
                            ))}
                          </select>

                          <select
                            value={selectedRegencyCode}
                            onChange={(e) => {
                              handleRegencyChange(e.target.value)
                            }}
                            disabled={!selectedProvinceCode || loadingRegencies}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="">
                              {newAddress.city && selectedRegencyCode === ''
                                ? `${tr('Current City', 'Kota Saat Ini')}: ${newAddress.city}`
                                : tr('Select City', 'Pilih Kota')}
                            </option>
                            {regencyOptions.map((regency) => (
                              <option key={regency.code} value={regency.code}>
                                {getDisplayRegionName(regency.name)}
                              </option>
                            ))}
                          </select>

                          {/* Couriers rate to kecamatan level; without it a quote
                              is only as good as the postcode behind it. */}
                          <input
                            type="text"
                            value={newAddress.district}
                            onChange={(e) => setNewAddress({ ...newAddress, district: e.target.value })}
                            placeholder={tr('District (Kecamatan)', 'Kecamatan')}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                          />

                          <input
                            list="postal-code-suggestions"
                            inputMode="numeric"
                            pattern="[0-9]{5}"
                            maxLength={5}
                            value={newAddress.postal_code}
                            onChange={(e) => {
                              const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 5)
                              setNewAddress({ ...newAddress, postal_code: digitsOnly })
                            }}
                            placeholder={tr('Postal Code (5 digits)', 'Kode Pos (5 digit)')}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                          />
                          <datalist id="postal-code-suggestions">
                            {postalCodeSuggestions.map((postalCode) => (
                              <option key={postalCode} value={postalCode} />
                            ))}
                          </datalist>
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={newAddress.province}
                            onChange={(e) => setNewAddress({ ...newAddress, province: e.target.value })}
                            placeholder={tr('State / Province / Region', 'Negara Bagian / Provinsi')}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                          />
                          <input
                            type="text"
                            value={newAddress.city}
                            onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                            placeholder={tr('City', 'Kota')}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                          />
                          <input
                            type="text"
                            value={newAddress.postal_code}
                            onChange={(e) => setNewAddress({ ...newAddress, postal_code: e.target.value })}
                            placeholder={
                              isFormPostalRequired
                                ? tr('Postal / ZIP Code', 'Kode Pos')
                                : tr('Postal Code (optional)', 'Kode Pos (opsional)')
                            }
                            className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-black placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </>
                      )}

                      <label className="col-span-2 inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={newAddress.is_default}
                          onChange={(e) => setNewAddress({ ...newAddress, is_default: e.target.checked })}
                          className="w-4 h-4"
                        />
                        {tr('Set as default address', 'Jadikan sebagai alamat utama')}
                      </label>
                    </div>
                    {/* The ongkir note only makes sense when ongkir is on show. */}
                    {(isFormDomestic || SHIPPING_ENABLED) && (
                      <p className="text-xs text-gray-500">
                        {isFormDomestic
                          ? tr(
                              'Province and city are loaded from wilayah.id API. Postal code is entered manually because the API does not provide postal code data.',
                              'Provinsi dan kota dimuat dari API wilayah.id. Kode pos diisi manual karena API tidak menyediakan data kode pos.'
                            )
                          : tr(
                              'Shipping cost is calculated automatically once the address is saved.',
                              'Ongkos kirim dihitung otomatis setelah alamat disimpan.'
                            )}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveAddress}
                        disabled={savingAddress}
                        className="btn-primary-animated px-4 py-2"
                      >
                        {savingAddress
                          ? tr('Saving...', 'Menyimpan...')
                          : editingAddressId
                          ? tr('Update Address', 'Perbarui Alamat')
                          : tr('Save Address', 'Simpan Alamat')}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddressForm(false)
                          resetAddressForm()
                        }}
                        className="btn-secondary-animated px-4 py-2"
                      >
                        {tr('Cancel', 'Batal')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          void handleStartAddAddress()
                        }}
                        disabled={isAddressLimitReached}
                        className="text-black hover:underline font-medium btn-animate disabled:text-gray-400 disabled:no-underline"
                      >
                        + {tr('Add New Address', 'Tambah Alamat Baru')}
                      </button>
                      <span className="text-xs text-gray-500">
                        {addresses.length}/3 {tr('addresses saved', 'alamat tersimpan')}
                      </span>
                    </div>
                    {isAddressLimitReached && (
                      <p className="text-sm text-red-600">
                        {tr('Maximum 3 addresses per user', 'Maksimal 3 alamat per user')}
                      </p>
                    )}
                  </div>
                )}

                {/* "Spend 50k more for 10% off" — a merchandise promotion is worth
                    surfacing whether or not couriers are on show. */}
                {nearMisses.length > 0 && !showAddressForm && (
                  <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-start gap-2">
                    <Gift className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-emerald-800">
                      {describeNearMiss(
                        {
                          promotion: {
                            condition_type: nearMisses[0].conditionType,
                            condition_value: nearMisses[0].conditionValue,
                            reward_type: nearMisses[0].rewardType,
                            reward_value: nearMisses[0].rewardValue,
                            max_discount: nearMisses[0].maxDiscount,
                          },
                          remaining: nearMisses[0].remaining,
                        },
                        language
                      )}
                    </p>
                  </div>
                )}

                {/* Courier selection — priced live for the selected address */}
                {SHIPPING_ENABLED && selectedAddress && !showAddressForm && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-black mb-1 flex items-center gap-2">
                      <Truck className="w-5 h-5" />
                      {tr('Shipping Service', 'Layanan Pengiriman')}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {parcelWeightGrams > 0
                        ? tr(
                            `Calculated for a ${(parcelWeightGrams / 1000).toFixed(2)} kg parcel to ${selectedAddress.city}.`,
                            `Dihitung untuk paket ${(parcelWeightGrams / 1000).toFixed(2)} kg ke ${selectedAddress.city}.`
                          )
                        : tr(
                            'Rates are calculated from your selected address.',
                            'Ongkir dihitung berdasarkan alamat yang dipilih.'
                          )}
                    </p>

                    {customsNote && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800">
                          {language === 'en' ? customsNote.en : customsNote.id}
                        </p>
                      </div>
                    )}

                    {loadingRates ? (
                      <LoadingSpinner label={tr('Calculating shipping cost...', 'Menghitung ongkos kirim...')} />
                    ) : ratesError ? (
                      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-700">
                        <p>{ratesError}</p>
                        <button
                          type="button"
                          onClick={() => void loadShippingRates(selectedAddress.id)}
                          className="mt-2 font-semibold underline"
                        >
                          {tr('Try again', 'Coba lagi')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {shippingOptions.map((option) => {
                          const isSelected = option.key === selectedShippingKey
                          const isFree = option.finalCost === 0

                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setSelectedShippingKey(option.key)}
                              className={`w-full text-left border-2 rounded-lg p-3 transition ${
                                isSelected
                                  ? 'border-black bg-gray-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-black truncate">
                                    {option.courierName} — {option.serviceName}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    {tr(
                                      `Estimated ${option.etdMinDays}-${option.etdMaxDays} days`,
                                      `Estimasi ${option.etdMinDays}-${option.etdMaxDays} hari`
                                    )}
                                  </p>
                                  {option.appliedPromotions.map((promotion) => (
                                    <p
                                      key={promotion.id}
                                      className="text-xs font-medium text-emerald-700 mt-1 inline-flex items-center gap-1"
                                    >
                                      <Gift className="w-3 h-3" />
                                      {language === 'en'
                                        ? promotion.name
                                        : promotion.name_id || promotion.name}
                                    </p>
                                  ))}
                                </div>
                                <div className="text-right shrink-0">
                                  {option.discount > 0 && (
                                    <p className="text-xs text-gray-400 line-through">
                                      {formatPrice(option.baseCost)}
                                    </p>
                                  )}
                                  <p
                                    className={`font-bold ${
                                      isFree ? 'text-emerald-600' : 'text-black'
                                    }`}
                                  >
                                    {isFree ? tr('FREE', 'GRATIS') : formatPrice(option.finalCost)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => setCurrentStep('payment')}
                  disabled={
                    !selectedAddress || (SHIPPING_ENABLED && (!selectedShippingOption || loadingRates))
                  }
                  className="w-full mt-6 py-3 btn-primary-animated"
                >
                  {tr('Continue to Payment', 'Lanjut ke Pembayaran')}
                </button>
              </div>
            )}

            {/* Payment Step */}
            {currentStep === 'payment' && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-black mb-4 flex items-center gap-2">
                  <CreditCard className="w-6 h-6" />
                  {tr('Payment Method', 'Metode Pembayaran')}
                </h2>

                {paymentMethodError && (
                  <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm px-3 py-2">
                    {paymentMethodError}
                  </div>
                )}

                {loadingPaymentMethods ? (
                  <LoadingSpinner label={tr('Loading payment methods...', 'Memuat metode pembayaran...')} />
                ) : (
                  <div className="space-y-3 mb-6">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.code}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method.code)
                          setPendingPaypalOrder(null)
                        }}
                        className={`w-full text-left border-2 rounded-lg p-4 transition ${
                          paymentMethod === method.code
                            ? 'border-black bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-black">{method.display_name}</p>
                            {method.description && (
                              <p className="text-sm text-gray-600 mt-1">{method.description}</p>
                            )}
                          </div>
                          {paymentMethod === method.code && (
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-black text-white">
                              {tr('Selected', 'Dipilih')}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedPaymentMethod && (
                  <div className="mb-6 rounded-xl border border-gray-200 bg-linear-to-br from-gray-50 to-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                          {tr('Selected Payment', 'Pembayaran Terpilih')}
                        </p>
                        <p className="text-lg font-bold text-black mt-1">
                          {selectedPaymentMethod.display_name}
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black text-white">
                        {tr('Active', 'Aktif')}
                      </span>
                    </div>

                    <div className="mt-4 rounded-lg border border-gray-300 bg-white p-4 space-y-3">
                      {selectedPaymentMethod.provider_name && (
                        <div>
                          <p className="text-xs text-gray-500">{tr('Provider/Bank', 'Provider/Bank')}</p>
                          <p className="font-semibold text-black">{selectedPaymentMethod.provider_name}</p>
                        </div>
                      )}

                      {selectedPaymentMethod.account_name && (
                        <div>
                          <p className="text-xs text-gray-500">{tr('Account Name', 'Nama Rekening')}</p>
                          <p className="font-semibold text-black">{selectedPaymentMethod.account_name}</p>
                        </div>
                      )}

                      {selectedPaymentMethod.account_number && (
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="text-xs text-gray-500">{tr('Account Number', 'Nomor Rekening')}</p>
                            <p className="text-xl font-bold tracking-wider text-black">{selectedPaymentMethod.account_number}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyAccountNumber(selectedPaymentMethod.account_number || '')}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
                          >
                            {copiedValue === selectedPaymentMethod.account_number ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copiedValue === selectedPaymentMethod.account_number
                              ? tr('Copied', 'Tersalin')
                              : tr('Copy Number', 'Salin Nomor')}
                          </button>
                        </div>
                      )}

                      {selectedPaymentMethod.instructions && (
                        <p className="text-sm text-gray-700 whitespace-pre-line">{selectedPaymentMethod.instructions}</p>
                      )}

                      {selectedPaymentMethod.code === 'qris' && (
                        <div className="mt-4 flex flex-col items-center gap-3">
                          <img
                            src="/qris/bearion-qris.jpeg"
                            alt={tr('QRIS', 'QRIS')}
                            className="max-w-xs w-full h-auto rounded-lg border border-gray-200"
                          />
                          <p className="text-sm text-gray-600 text-center">
                            {tr(
                              'Scan this QR with your banking or e-wallet app to pay the exact amount.',
                              'Scan QR ini dengan aplikasi perbankan atau dompet digital untuk melakukan pembayaran.'
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 text-sm text-gray-600 rounded-lg bg-gray-100 px-3 py-2">
                      {selectedPaymentMethod.requires_proof
                        ? tr(
                            'This method requires payment proof upload after order placement.',
                            'Metode ini mewajibkan upload bukti pembayaran setelah membuat pesanan.'
                          )
                        : tr(
                            'You can complete this method without payment proof upload.',
                            'Metode ini bisa diselesaikan tanpa upload bukti pembayaran.'
                          )}
                    </div>
                  </div>
                )}

                {!selectedPaymentMethod && (
                  <div className="mb-6 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm px-3 py-2">
                    {tr('No payment method available. Contact admin.', 'Tidak ada metode pembayaran tersedia. Hubungi admin.')}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentStep('shipping')}
                    className="btn-secondary-animated px-6 py-3"
                  >
                    {tr('Back', 'Kembali')}
                  </button>
                  <button
                    onClick={() => setCurrentStep('review')}
                    disabled={!selectedPaymentMethod}
                    className="flex-1 btn-primary-animated py-3 disabled:opacity-50"
                  >
                    {tr('Review Order', 'Tinjau Pesanan')}
                  </button>
                </div>
              </div>
            )}

            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                {/* Shipping Info */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold">{tr('Shipping Address', 'Alamat Pengiriman')}</h3>
                    <button
                      onClick={() => setCurrentStep('shipping')}
                      className="text-sm text-gray-600 hover:text-black btn-animate"
                    >
                      {tr('Edit', 'Ubah')}
                    </button>
                  </div>
                  {selectedAddress && (
                    <div>
                      <p className="font-medium">{selectedAddress.recipient_name}</p>
                      <p className="text-sm text-gray-600">{selectedAddress.phone}</p>
                      <p className="text-sm text-gray-600 mt-2">
                        {selectedAddress.address_line1}
                        {selectedAddress.address_line2 && `, ${selectedAddress.address_line2}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        {selectedAddress.city}, {selectedAddress.province} {selectedAddress.postal_code}
                      </p>
                    </div>
                  )}
                </div>

                {/* Payment Info */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold">{tr('Payment Method', 'Metode Pembayaran')}</h3>
                    <button
                      onClick={() => setCurrentStep('payment')}
                      className="text-sm text-gray-600 hover:text-black btn-animate"
                    >
                      {tr('Edit', 'Ubah')}
                    </button>
                  </div>
                  {selectedPaymentMethod ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                      <p className="text-sm text-gray-600">{tr('Method', 'Metode')}</p>
                      <p className="font-semibold text-black">{selectedPaymentMethod.display_name}</p>
                      {selectedPaymentMethod.provider_name && (
                        <p className="text-sm text-gray-700">{selectedPaymentMethod.provider_name}</p>
                      )}
                      {selectedPaymentMethod.account_name && (
                        <p className="text-sm text-gray-700">{selectedPaymentMethod.account_name}</p>
                      )}
                      {selectedPaymentMethod.account_number && (
                        <p className="text-lg font-bold tracking-wide text-black">{selectedPaymentMethod.account_number}</p>
                      )}
                      {selectedPaymentMethod.instructions && (
                        <p className="text-sm text-gray-700 whitespace-pre-line">{selectedPaymentMethod.instructions}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-red-600">
                      {tr('No payment method selected', 'Belum ada metode pembayaran terpilih')}
                    </p>
                  )}
                </div>

                {/* Customer Notes */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="font-semibold mb-3">{tr('Order Notes (Optional)', 'Catatan Pesanan (Opsional)')}</h3>
                  <textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder={tr('Special instructions for your order...', 'Instruksi khusus untuk pesanan Anda...')}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black resize-none"
                    rows={4}
                  />
                </div>

                {pendingPaypalOrder ? (
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-600 mb-3">
                      {tr(
                        'Complete your payment with PayPal below to finish placing your order.',
                        'Selesaikan pembayaran dengan PayPal di bawah untuk menyelesaikan pesanan Anda.'
                      )}
                    </p>
                    <PayPalCheckoutButton
                      orderNumber={pendingPaypalOrder.order_number}
                      onSuccess={handlePaypalSuccess}
                    />
                  </div>
                ) : (
                  <button
                    onClick={handlePlaceOrder}
                    disabled={processing}
                    className="w-full py-4 btn-primary-animated"
                  >
                    {processing ? tr('Processing...', 'Memproses...') : tr('Place Order', 'Buat Pesanan')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-24 lg:top-28">
              <h2 className="text-xl font-semibold text-black mb-4">
                {tr('Order Summary', 'Ringkasan Pesanan')}
              </h2>

              {/* Items */}
              <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
                {cartItems.map((item) => {
                  const unitPrice = item.product ? getEffectiveIdrPrice(item.product) : 0
                  const listPrice = item.product ? getIdrPrice(item.product) : 0
                  const lineDiscounted = listPrice > unitPrice

                  return (
                    <div key={item.id} className="flex justify-between gap-3">
                      <div className="text-sm min-w-0">
                        <p className="font-medium text-black truncate">{item.product?.name}</p>
                        <p className="text-gray-600">{tr('Qty', 'Jumlah')}: {item.quantity}</p>
                      </div>
                      <div className="text-sm text-right shrink-0">
                        {lineDiscounted && (
                          <p className="text-xs text-gray-400 line-through">
                            {formatPrice(listPrice * item.quantity)}
                          </p>
                        )}
                        <p className={`font-semibold ${lineDiscounted ? 'text-red-600' : 'text-black'}`}>
                          {formatPrice(unitPrice * item.quantity)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Totals */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-gray-600">
                  <span>{tr('Subtotal', 'Subtotal')}</span>
                  <span>{formatPrice(originalSubtotal)}</span>
                </div>
                {productSavings > 0 && (
                  <div className="flex justify-between font-semibold text-red-600">
                    <span>{tr('Product discount', 'Diskon produk')}</span>
                    <span>-{formatPrice(productSavings)}</span>
                  </div>
                )}
                {orderDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>{tr('Promo discount', 'Diskon promo')}</span>
                    <span>-{formatPrice(orderDiscount)}</span>
                  </div>
                )}
                {SHIPPING_ENABLED && (
                  <div className="flex justify-between text-gray-600">
                    <span>
                      {tr('Shipping', 'Pengiriman')}
                      {selectedShippingOption && (
                        <span className="block text-xs text-gray-500">
                          {selectedShippingOption.courierName} {selectedShippingOption.serviceName}
                        </span>
                      )}
                    </span>
                    <span className="text-right">
                      {!selectedShippingOption ? (
                        <span className="text-gray-400">
                          {loadingRates ? tr('Calculating...', 'Menghitung...') : '—'}
                        </span>
                      ) : (
                        <>
                          {shippingDiscount > 0 && (
                            <span className="block text-xs text-gray-400 line-through">
                              {formatPrice(selectedShippingOption.baseCost)}
                            </span>
                          )}
                          {shippingCost === 0 ? (
                            <span className="font-semibold text-emerald-600">
                              {tr('FREE', 'GRATIS')}
                            </span>
                          ) : (
                            formatPrice(shippingCost)
                          )}
                        </>
                      )}
                    </span>
                  </div>
                )}
                {TAX_ENABLED && (
                  <div className="flex justify-between text-gray-600">
                    <span>{tr('Tax', 'Pajak')}</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
                )}
                {appliedPromotions.length > 0 && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 space-y-1">
                    {appliedPromotions.map((promotion) => (
                      <p
                        key={promotion.id}
                        className="text-xs text-emerald-800 inline-flex items-center gap-1"
                      >
                        <Gift className="w-3 h-3 shrink-0" />
                        {language === 'en' ? promotion.name : promotion.name_id || promotion.name}
                      </p>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between text-lg font-bold text-black">
                    <span>{tr('Total', 'Total')}</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  {productSavings + orderDiscount > 0 && (
                    <p className="mt-1 text-sm font-semibold text-emerald-600">
                      {tr(
                        `You save ${formatPrice(productSavings + orderDiscount)}`,
                        `Hemat ${formatPrice(productSavings + orderDiscount)}`
                      )}
                    </p>
                  )}
                  {/* Catalog prices can be shown in USD, but orders are always
                      created and settled in IDR — say so before they pay. */}
                  {language === 'en' && (
                    <p className="text-xs text-gray-500 mt-2">
                      Orders are processed in Indonesian Rupiah (IDR). Card and PayPal
                      payments are converted by the payment provider at checkout.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Delete Address Confirmation Modal */}
    <ConfirmDeleteModal
      isOpen={deleteModalOpen}
      title={tr('Delete Address', 'Hapus Alamat')}
      description={tr('Are you sure you want to delete this address? This action cannot be undone.', 'Apakah Anda yakin ingin menghapus alamat ini? Tindakan ini tidak dapat dibatalkan.')}
      itemName={addressToDelete ? `${addressToDelete.recipient_name} • ${addressToDelete.address_line1}` : undefined}
      isLoading={false}
      onConfirm={confirmDeleteAddress}
      onCancel={() => {
        setDeleteModalOpen(false)
        setAddressToDelete(null)
      }}
      confirmText={tr('Delete Address', 'Hapus Alamat')}
      cancelText={tr('Cancel', 'Batal')}
      isDangerous={true}
    />
    </div>
  )
}
