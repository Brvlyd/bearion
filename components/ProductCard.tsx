'use client'

import Link from 'next/link'
import { Product } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { productService } from '@/lib/products'
import { getDiscountPercent } from '@/lib/price'
import DiscountBadge from './DiscountBadge'
import ProductPrice from './ProductPrice'
import SafeImage from './SafeImage'
import QuickAddModal from './QuickAddModal'

interface ProductCardProps {
  product: Product
  /** Pre-fetched images from a batched parent query. When provided the card
   *  skips its own request, which is what keeps grid views off spinners. */
  images?: string[]
}

export default function ProductCard({ product, images: providedImages }: ProductCardProps) {
  const { t, language } = useLanguage()
  const discountPercent = getDiscountPercent(product)

  const getProductName = () => {
    if (language === 'id' && product.name_id) {
      return product.name_id
    }
    return product.name
  }
  
  const hasProvidedImages = providedImages !== undefined
  const [images, setImages] = useState<string[]>(
    hasProvidedImages ? providedImages : []
  )
  const [loading, setLoading] = useState(!hasProvidedImages)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  useEffect(() => {
    if (hasProvidedImages) {
      setImages(providedImages)
      return
    }
    loadImages()
  }, [product.id, hasProvidedImages, providedImages])

  const loadImages = async () => {
    try {
      const imageUrls = await productService.getProductImageUrls(product.id, product.image_url)
      setImages(imageUrls)
    } catch (error) {
      console.error('Error loading product images:', error)
      if (product.image_url) {
        setImages([product.image_url])
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Link href={`/products/${product.id}`}>
        <div className="group cursor-pointer">
          <div className="aspect-square bg-gray-50 border border-gray-200 rounded-lg overflow-hidden mb-4 relative">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
              </div>
            ) : (
              <SafeImage
                src={images[0] || product.image_url}
                alt={getProductName()}
                fill
                category={product.category}
                className="transition-transform duration-300 group-hover:scale-105"
              />
            )}
            {/* A markdown has to be visible from the grid, not only after a click. */}
            {discountPercent !== null && discountPercent > 0 && (
              <DiscountBadge percent={discountPercent} size="md" className="absolute top-2 left-2 z-10" />
            )}
            {product.stock === 0 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                <span className="text-white font-semibold">{t('product.outOfStock')}</span>
              </div>
            )}
            {product.stock > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowQuickAdd(true)
                }}
                aria-label={t('product.addToCart')}
                className="absolute bottom-2 right-2 z-10 w-9 h-9 rounded-full bg-black text-white flex items-center justify-center shadow-lg btn-icon-animated hover:bg-gray-800"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
          <h3 className="font-semibold text-lg mb-1 group-hover:text-gray-600 transition text-black">
            {getProductName()}
          </h3>
          <ProductPrice product={product} size="md" />
          <p className="text-sm text-gray-500 mt-1">{t('product.stock')}: {product.stock}</p>
        </div>
      </Link>

      {showQuickAdd && (
        <QuickAddModal
          product={product}
          image={images[0] || product.image_url}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </>
  )
}
