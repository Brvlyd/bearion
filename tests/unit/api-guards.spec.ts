import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { POST as createOrder } from '@/app/api/orders/create/route'
import { POST as cancelOrder } from '@/app/api/orders/[orderNumber]/cancel/route'
import { POST as adminCancelOrder } from '@/app/api/admin/orders/[id]/cancel/route'
import { POST as reviewProof } from '@/app/api/admin/payment-proofs/review/route'
import { POST as deleteUser } from '@/app/api/admin/users/delete/route'
import { POST as paypalCreate } from '@/app/api/paypal/create-order/route'
import { POST as paypalCapture } from '@/app/api/paypal/capture-order/route'
import { POST as paypalReconcile } from '@/app/api/paypal/reconcile/route'
import { POST as sendEmail } from '@/app/api/notifications/send-email/route'
import { POST as syncTracking } from '@/app/api/shipping/sync-tracking/route'
import { POST as biteshipWebhook } from '@/app/api/webhooks/biteship/route'

// Every money- or data-changing route must refuse an anonymous caller before
// touching Supabase. These run without network: a missing token is rejected
// locally, so a regression here means a route started trusting the request.

const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

test.describe('session-protected routes reject anonymous callers', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['orders/create', () => createOrder(post('/api/orders/create'))],
    ['orders/cancel', () => cancelOrder(post('/api/orders/X/cancel'), params({ orderNumber: 'X' }))],
    ['admin/orders/cancel', () => adminCancelOrder(post('/api/admin/orders/1/cancel'), params({ id: '1' }))],
    ['admin/payment-proofs/review', () => reviewProof(post('/api/admin/payment-proofs/review'))],
    ['admin/users/delete', () => deleteUser(post('/api/admin/users/delete'))],
    ['paypal/create-order', () => paypalCreate(post('/api/paypal/create-order'))],
    ['paypal/capture-order', () => paypalCapture(post('/api/paypal/capture-order'))],
    ['notifications/send-email', () => sendEmail(post('/api/notifications/send-email'))],
  ]

  for (const [name, call] of cases) {
    test(name, async () => {
      const response = await call()
      expect(response.status).toBe(401)
    })
  }
})

test.describe('shared-secret routes', () => {
  const secretRoutes: Array<[string, string, (request: NextRequest) => Promise<Response>]> = [
    ['shipping/sync-tracking', 'SHIPPING_SYNC_SECRET', syncTracking],
    ['paypal/reconcile', 'PAYPAL_SYNC_SECRET', paypalReconcile],
  ]

  for (const [name, envName, handler] of secretRoutes) {
    test(`${name} stays off while its secret is unset`, async () => {
      const previous = process.env[envName]
      delete process.env[envName]
      try {
        expect((await handler(post(`/api/${name}`))).status).toBe(503)
      } finally {
        if (previous !== undefined) process.env[envName] = previous
      }
    })

    test(`${name} rejects a wrong secret`, async () => {
      const previous = process.env[envName]
      process.env[envName] = 'expected-secret'
      try {
        const response = await handler(post(`/api/${name}`, { 'x-sync-secret': 'wrong' }))
        expect(response.status).toBe(401)
      } finally {
        if (previous === undefined) delete process.env[envName]
        else process.env[envName] = previous
      }
    })
  }

  test('biteship webhook rejects a wrong token', async () => {
    const previous = process.env.BITESHIP_WEBHOOK_SECRET
    process.env.BITESHIP_WEBHOOK_SECRET = 'expected-secret'
    try {
      const response = await biteshipWebhook(
        post('/api/webhooks/biteship', { 'x-webhook-token': 'wrong' })
      )
      expect(response.status).toBe(401)
    } finally {
      if (previous === undefined) delete process.env.BITESHIP_WEBHOOK_SECRET
      else process.env.BITESHIP_WEBHOOK_SECRET = previous
    }
  })
})
