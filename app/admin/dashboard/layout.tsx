'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'
import Link from 'next/link'
import { authService } from '@/lib/auth'
import { Package, BarChart3, Users, ShoppingCart, X, Image as ImageIcon, Images, Info, CreditCard, Settings, Truck, Gift, Mail, KeyRound } from 'lucide-react'
import AdminHeader from '@/components/AdminHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useSiteSettings } from '@/components/SiteSettingsProvider'
import { LOGO_ASPECT_RATIO, resolveDarkBgLogoUrl } from '@/lib/site-settings'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { t, language } = useLanguage()
  const siteSettings = useSiteSettings()
  // Same mark the storefront header uses: the white variant of the bundled
  // logo, or the CMS upload once one is set. The sidebar is black, so the
  // black default artwork would be invisible here.
  const logoSrc = resolveDarkBgLogoUrl(siteSettings.logo_url, siteSettings.updated_at)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    checkAdmin()
  }, [])

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const checkAdmin = async () => {
    try {
      const admin = await authService.isAdmin()
      if (!admin) {
        router.push('/admin/login')
      } else {
        setIsAdmin(true)
      }
    } catch {
      router.push('/admin/login')
    } finally {
      setLoading(false)
    }
  }

  const isActiveRoute = (route: string) => {
    return pathname === route
  }

  if (loading) {
    return <LoadingSpinner fullScreen variant="light" className="bg-black" label={t('admin.verifyingAccess')} />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Modern Admin Sidebar */}
      <aside className={`fixed left-0 top-0 h-full w-64 flex flex-col bg-linear-to-b from-gray-900 via-gray-900 to-black text-white shadow-2xl z-50 transition-transform duration-300 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo Section — h-18 is the header's height, so the two bottom
            borders line up instead of stepping at the sidebar edge. */}
        <div className="shrink-0 h-18 px-4 border-b border-white/10 flex items-center">
          <div className="flex w-full items-center justify-between gap-2">
            <Link href="/" className="flex min-w-0 items-center gap-3 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt={siteSettings.site_title}
                style={{ aspectRatio: LOGO_ASPECT_RATIO }}
                className="h-11 w-auto shrink-0 object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <span className="min-w-0 border-l border-white/15 pl-3 text-xs text-gray-400 leading-tight">
                {t('adminSidebar.adminPanel')}
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden shrink-0 p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-dark p-4 space-y-1">
          <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('adminSidebar.mainMenu')}
          </p>
          
          <Link
            href="/admin/dashboard"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              isActiveRoute('/admin/dashboard')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {isActiveRoute('/admin/dashboard') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <BarChart3 className={`w-5 h-5 transition-all duration-200 ${
              isActiveRoute('/admin/dashboard') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{t('adminSidebar.dashboard')}</span>
          </Link>

          <Link
            href="/admin/dashboard/products"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              isActiveRoute('/admin/dashboard/products')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {isActiveRoute('/admin/dashboard/products') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Package className={`w-5 h-5 transition-all duration-200 ${
              isActiveRoute('/admin/dashboard/products') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{t('adminSidebar.products')}</span>
          </Link>

          <Link
            href="/admin/dashboard/orders"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/orders')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/orders') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <ShoppingCart className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/orders') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Orders' : 'Pesanan'}</span>
          </Link>

          <Link
            href="/admin/dashboard/users"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/users')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/users') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Users className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/users') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Users' : 'Pengguna'}</span>
          </Link>

          <Link
            href="/admin/dashboard/landing-page"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/landing-page')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/landing-page') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <ImageIcon className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/landing-page') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Content' : 'Konten'}</span>
          </Link>

          <Link
            href="/admin/dashboard/community"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/community')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/community') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Images className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/community') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Community' : 'Komunitas'}</span>
          </Link>

          <Link
            href="/admin/dashboard/about"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/about')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/about') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Info className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/about') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'About Us' : 'Tentang Kami'}</span>
          </Link>

          <Link
            href="/admin/dashboard/contact"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/contact')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/contact') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Mail className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/contact') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Contact Page' : 'Halaman Kontak'}</span>
          </Link>

          <Link
            href="/admin/dashboard/promotions"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/promotions')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/promotions') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Gift className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/promotions') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Discounts' : 'Diskon'}</span>
          </Link>

          <Link
            href="/admin/dashboard/shipping"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/shipping')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/shipping') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Truck className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/shipping') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Shipping' : 'Pengiriman'}</span>
          </Link>

          <Link
            href="/admin/dashboard/payment-methods"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/payment-methods')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/payment-methods') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <CreditCard className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/payment-methods') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Payment Methods' : 'Metode Pembayaran'}</span>
          </Link>

          <Link
            href="/admin/dashboard/site-settings"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/site-settings')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/site-settings') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <Settings className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/site-settings') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Site Settings' : 'Pengaturan Situs'}</span>
          </Link>

          <Link
            href="/admin/dashboard/account"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
              pathname?.startsWith('/admin/dashboard/account')
                ? 'bg-white/10 text-white shadow-lg'
                : 'hover:bg-white/5 text-gray-300 hover:text-white'
            }`}
          >
            {pathname?.startsWith('/admin/dashboard/account') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></span>
            )}
            <KeyRound className={`w-5 h-5 transition-all duration-200 ${
              pathname?.startsWith('/admin/dashboard/account') ? 'scale-110' : 'group-hover:scale-110'
            }`} />
            <span className="font-medium">{language === 'en' ? 'Admin Account' : 'Akun Admin'}</span>
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="shrink-0 p-4 border-t border-white/10">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-200 group"
          >
            <span className="text-sm font-medium">{t('adminSidebar.viewStore')}</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </aside>

      {/* Admin Header - Pass sidebar state */}
      <AdminHeader sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Main Content */}
      <div className="lg:ml-64 pt-18">
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
