// Server-only helpers for the PayPal Orders v2 API (live payment capture).
// Requires NEXT_PUBLIC_PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_API_BASE.
// Never import this file from client components — PAYPAL_CLIENT_SECRET must stay server-side.

// Re-exported so callers that already import the IDR->USD math from here
// (e.g. app/api/paypal/create-order) don't need to change — the canonical
// definition lives in lib/price.ts, which is also safe to import client-side
// for display-only conversions (shipping, cart totals) that must use the
// exact same formula as the actual charge.
export { convertIdrToUsd } from './price'

type PayPalAccessToken = {
  token: string
  expiresAt: number
}

let cachedToken: PayPalAccessToken | null = null

type ExchangeRateCache = {
  idrPerUsd: number
  fetchedAt: number
}

let cachedRate: ExchangeRateCache | null = null
const RATE_TTL_MS = 30 * 60 * 1000 // refresh every 30 minutes
const RATE_STALE_FALLBACK_MS = 6 * 60 * 60 * 1000 // tolerate a stale cached rate for up to 6h if the live fetch fails

function getPayPalApiBase(): string {
  return process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com'
}

async function getPayPalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token
  }

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error(
      'PayPal is not configured. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your environment.'
    )
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`PayPal auth failed (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return cachedToken.token
}

// Returns how many IDR are worth 1 USD.
export async function getIdrPerUsdRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < RATE_TTL_MS) {
    return cachedRate.idrPerUsd
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`)
    }

    const data = await response.json()
    const rate = data?.rates?.IDR

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('Exchange rate API response missing a valid IDR rate')
    }

    cachedRate = { idrPerUsd: rate, fetchedAt: Date.now() }
    return rate
  } catch (error) {
    if (cachedRate && Date.now() - cachedRate.fetchedAt < RATE_STALE_FALLBACK_MS) {
      console.warn('Using stale IDR/USD exchange rate after a live fetch failure:', error)
      return cachedRate.idrPerUsd
    }
    throw error
  }
}

export async function createPayPalOrder(params: {
  usdAmount: string
  orderNumber: string
}): Promise<{ paypalOrderId: string }> {
  const token = await getPayPalAccessToken()

  const response = await fetch(`${getPayPalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: params.orderNumber,
          amount: {
            currency_code: 'USD',
            value: params.usdAmount,
          },
        },
      ],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`PayPal create order failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return { paypalOrderId: data.id }
}

export type PayPalCaptureResult = {
  status: string
  customId: string | null
  capturedAmount: string | null
  capturedCurrency: string | null
  captureId: string | null
  raw: unknown
}

// A captured order and a freshly-read one carry the capture in the same place,
// so both endpoints below can share one parser.
function parseOrderPayload(data: {
  status?: string
  purchase_units?: Array<{
    custom_id?: string
    payments?: { captures?: Array<{ id?: string; amount?: { value?: string; currency_code?: string } }> }
  }>
}): PayPalCaptureResult {
  const purchaseUnit = data?.purchase_units?.[0]
  const capture = purchaseUnit?.payments?.captures?.[0]

  return {
    status: data.status ?? '',
    customId: purchaseUnit?.custom_id ?? null,
    capturedAmount: capture?.amount?.value ?? null,
    capturedCurrency: capture?.amount?.currency_code ?? null,
    captureId: capture?.id ?? null,
    raw: data,
  }
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<PayPalCaptureResult> {
  const token = await getPayPalAccessToken()

  const response = await fetch(
    `${getPayPalApiBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`PayPal capture failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return parseOrderPayload(data)
}

// Reads an order without changing it. Used by the reconcile sweep to tell an
// order the customer abandoned (CREATED) from one they approved but whose
// capture never reached us (APPROVED), and from one already paid (COMPLETED).
export async function getPayPalOrder(paypalOrderId: string): Promise<PayPalCaptureResult> {
  const token = await getPayPalAccessToken()

  const response = await fetch(
    `${getPayPalApiBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`PayPal get order failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return parseOrderPayload(data)
}
