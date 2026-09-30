import { expect, test, type Page } from '@playwright/test'

// Read-only storefront smoke tests. They never log in, add to cart or submit a
// form, so running them against the live site cannot create orders or users.

/** Collects uncaught page errors — a crash in a client component shows up here. */
const trackPageErrors = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const PUBLIC_PAGES = ['/', '/catalog', '/community', '/about', '/contact', '/login', '/register', '/forgot-password']

for (const path of PUBLIC_PAGES) {
  test(`${path} renders without crashing`, async ({ page }) => {
    const errors = trackPageErrors(page)
    const response = await page.goto(path)

    expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(errors, `uncaught errors on ${path}`).toEqual([])
  })
}

test('catalog links through to a product that can be added to the cart', async ({ page }) => {
  const errors = trackPageErrors(page)
  await page.goto('/catalog')

  const productLink = page.locator('a[href^="/products/"]').first()
  await expect(productLink, 'catalog should list at least one product').toBeVisible({ timeout: 20_000 })
  await productLink.click()

  await expect(page).toHaveURL(/\/products\/[^/]+$/)
  await expect(
    page.getByRole('button', { name: /add to cart|tambah ke keranjang|out of stock|stok habis/i }).first()
  ).toBeVisible({ timeout: 20_000 })
  expect(errors).toEqual([])
})

test('checkout sends a guest to login', async ({ page }) => {
  await page.goto('/checkout')
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
})

test('admin dashboard sends a guest to the admin login', async ({ page }) => {
  await page.goto('/admin/dashboard')
  await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 })
})

test('robots.txt and sitemap.xml are served', async ({ request }) => {
  expect((await request.get('/robots.txt')).ok()).toBe(true)

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  expect(await sitemap.text()).toContain('<urlset')
})

test('order API refuses anonymous checkout', async ({ request }) => {
  const response = await request.post('/api/orders/create', { data: {} })
  expect(response.status()).toBe(401)
})
