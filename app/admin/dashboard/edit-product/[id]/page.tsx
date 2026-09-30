'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { productService } from '@/lib/products'
import { Product, supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import MultiImageUpload from '@/components/MultiImageUpload'
import ProductColorsEditor, {
  findColorDraftProblems,
  makeColorDraft,
  type ColorDraft,
} from '@/components/ProductColorsEditor'
import ProductPrice from '@/components/ProductPrice'
import Notification from '@/components/Notification'
import LoadingSpinner from '@/components/LoadingSpinner'
import { getErrorMessage } from '@/lib/errors'
import { describeSalePriceDraft } from '@/lib/price'
import { productColorService } from '@/lib/product-colors'

interface Category {
  id: string
  name: string
  description?: string
}

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { tr } = useLanguage()
  const [productId, setProductId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    name_id: '',
    description: '',
    description_id: '',
    price: '',
    sale_price: '',
    price_usd: '',
    stock: '',
    category: '',
    image_url: '',
    weight_grams: '',
    length_cm: '',
    width_cm: '',
    height_cm: '',
    hs_code: '',
    images: [] as string[]
  })
  const [colors, setColors] = useState<ColorDraft[]>([])

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    params.then((p) => setProductId(p.id))
  }, [params])

  useEffect(() => {
    if (productId) {
      loadProduct()
    }
  }, [productId])

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true })
      
      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  const loadProduct = async () => {
    try {
      setLoading(true)
      const data = await productService.getProductById(productId)
      
      // Load product images
      const images = await productService.getProductImages(productId)
      const imageUrls = (images || []).map((img: { image_url: string }) => img.image_url)

      const colorRows = await productColorService.getColorsForProduct(productId)
      setColors(
        colorRows.map((row) =>
          makeColorDraft({
            name: row.name,
            name_id: row.name_id || '',
            hex_code: row.hex_code || '#111111',
            image_url: row.image_url || '',
          })
        )
      )

      setProduct(data)
      setFormData({
        name: data.name,
        name_id: data.name_id || '',
        description: data.description || '',
        description_id: data.description_id || '',
        price: data.price.toString(),
        sale_price: data.sale_price != null ? data.sale_price.toString() : '',
        price_usd: data.price_usd != null ? data.price_usd.toString() : '',
        stock: data.stock.toString(),
        category: data.category,
        image_url: data.image_url || '',
        weight_grams: data.weight_grams != null ? data.weight_grams.toString() : '',
        length_cm: data.length_cm != null ? data.length_cm.toString() : '',
        width_cm: data.width_cm != null ? data.width_cm.toString() : '',
        height_cm: data.height_cm != null ? data.height_cm.toString() : '',
        hs_code: data.hs_code || '',
        images: imageUrls.length > 0 ? imageUrls : (data.image_url ? [data.image_url] : [])
      })
    } catch (error) {
      console.error('Error loading product:', error)
      setNotification({ type: 'error', message: tr('Failed to load product', 'Gagal memuat produk') })
      setTimeout(() => {
        router.push('/admin/dashboard')
      }, 2000)
    } finally {
      setLoading(false)
    }
  }

  const saleDraft = describeSalePriceDraft(formData.price, formData.sale_price)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // A sale price at or above the normal price would render as a crossed-out
    // bargain that costs more — refuse it here rather than on the storefront.
    if (saleDraft.invalid) {
      setNotification({
        type: 'error',
        message: tr(
          'Sale price must be greater than 0 and lower than the normal price.',
          'Harga diskon harus lebih dari 0 dan lebih kecil dari harga normal.'
        ),
      })
      return
    }

    // Blank or repeated colour names are rejected by the unique index anyway;
    // catching them here explains why instead of surfacing a Postgres error.
    const colorProblems = findColorDraftProblems(colors)
    if (colorProblems.hasProblem) {
      setNotification({
        type: 'error',
        message: colorProblems.hasBlankName
          ? tr('Fill in every color name before saving.', 'Isi semua nama warna sebelum menyimpan.')
          : tr(
              'Two colors share the same name. Color names must be unique.',
              'Ada dua warna dengan nama sama. Nama warna harus unik.'
            ),
      })
      return
    }

    setSaving(true)

    try {
      await productService.updateProduct(productId, {
        name: formData.name,
        name_id: formData.name_id || null,
        description: formData.description || null,
        description_id: formData.description_id || null,
        price: parseFloat(formData.price),
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : null,
        price_usd: formData.price_usd ? parseFloat(formData.price_usd) : null,
        stock: parseInt(formData.stock),
        category: formData.category,
        image_url: formData.images[0] || null, // Use first image as main
        // Null means "fall back to the store default", so blanks stay blank.
        weight_grams: formData.weight_grams ? parseInt(formData.weight_grams) : null,
        length_cm: formData.length_cm ? parseFloat(formData.length_cm) : null,
        width_cm: formData.width_cm ? parseFloat(formData.width_cm) : null,
        height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
        hs_code: formData.hs_code.trim() || null,
      })

      // Save/update product images
      if (formData.images.length > 0) {
        await productService.saveProductImages(productId, formData.images)
      }

      await productColorService.saveProductColors(
        productId,
        colors.map((color) => ({
          name: color.name,
          name_id: color.name_id || null,
          hex_code: color.hex_code || null,
          image_url: color.image_url || null,
        }))
      )

      setNotification({ type: 'success', message: tr('Product updated successfully!', 'Produk berhasil diperbarui!') })
      setTimeout(() => {
        router.push('/admin/dashboard')
      }, 1500)
    } catch (error) {
      console.error('Error updating product:', error)
      setNotification({ type: 'error', message: tr('Failed to update product', 'Gagal memperbarui produk') + ': ' + getErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  if (loading) {
    return <LoadingSpinner label={tr('Loading product...', 'Memuat produk...')} />
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{tr('Product not found', 'Produk tidak ditemukan')}</p>
      </div>
    )
  }

  return (
    <div>
      <Link
        href="/admin/dashboard"
        className="flex items-center space-x-2 text-gray-600 hover:text-black mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>{tr('Back to Dashboard', 'Kembali ke Dashboard')}</span>
      </Link>

      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold mb-6 text-black">{tr('Edit Product', 'Ubah Produk')}</h2>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2 text-black">
              {tr('Product Name (English) *', 'Nama Produk (Inggris) *')}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
            />
          </div>

          <div>
            <label htmlFor="name_id" className="block text-sm font-medium mb-2 text-black">
              {tr('Product Name (Indonesian)', 'Nama Produk (Indonesia)')}
            </label>
            <input
              id="name_id"
              name="name_id"
              type="text"
              value={formData.name_id}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
              placeholder={tr('Example: Kaos Bearion Absolute', 'Contoh: Kaos Bearion Absolute')}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-2 text-black">
              {tr('Description (English)', 'Deskripsi (Inggris)')}
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
            />
          </div>

          <div>
            <label htmlFor="description_id" className="block text-sm font-medium mb-2 text-black">
              {tr('Description (Indonesian)', 'Deskripsi (Indonesia)')}
            </label>
            <textarea
              id="description_id"
              name="description_id"
              value={formData.description_id}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
              placeholder={tr('Product description in Indonesian...', 'Deskripsi produk...')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium mb-2 text-black">
                {tr('Price (IDR) *', 'Harga (IDR) *')}
              </label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
              />
            </div>

            <div>
              <label htmlFor="sale_price" className="block text-sm font-medium mb-2 text-black">
                {tr('Sale Price (IDR)', 'Harga Diskon (IDR)')}
              </label>
              <input
                id="sale_price"
                name="sale_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.sale_price}
                onChange={handleChange}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 placeholder:text-gray-400 text-black ${
                  saleDraft.invalid
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-black'
                }`}
              />
              {saleDraft.invalid ? (
                <p className="text-xs font-medium text-red-600 mt-1">
                  {tr(
                    'Sale price must be greater than 0 and lower than the normal price.',
                    'Harga diskon harus lebih dari 0 dan lebih kecil dari harga normal.'
                  )}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {tr(
                    'Optional. Enter a discounted price to show the original price crossed out. Clear the field to end the sale.',
                    'Opsional. Masukkan harga diskon agar harga asli dicoret. Kosongkan untuk mengakhiri diskon.'
                  )}
                </p>
              )}

              {/* Exactly what the shopper will see, so nobody has to publish a
                  product to find out how the markdown reads. */}
              {saleDraft.percent !== null && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 mb-1">
                    {tr('Storefront preview', 'Tampilan di toko')}
                  </p>
                  <ProductPrice
                    product={{ price: saleDraft.price, sale_price: saleDraft.salePrice }}
                    size="md"
                    showSavings
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price_usd" className="block text-sm font-medium mb-2 text-black">
                {tr('Price (USD)', 'Harga (USD)')}
              </label>
              <input
                id="price_usd"
                name="price_usd"
                type="number"
                step="0.01"
                min="0"
                value={formData.price_usd}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                placeholder="25.00"
              />
              <p className="text-xs text-gray-500 mt-1">
                {tr(
                  'Optional. Set by hand — it is not converted from IDR. Leave empty to show the IDR price to English visitors.',
                  'Opsional. Diisi manual — tidak dikonversi dari IDR. Kosongkan agar pengunjung bahasa Inggris tetap melihat harga IDR.'
                )}
              </p>
            </div>

            <div>
              <label htmlFor="stock" className="block text-sm font-medium mb-2 text-black">
                {tr('Stock *', 'Stok *')}
              </label>
              <input
                id="stock"
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                placeholder="100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price_usd" className="block text-sm font-medium mb-2 text-black">
                {tr('Price (USD)', 'Harga (USD)')}
              </label>
              <input
                id="price_usd"
                name="price_usd"
                type="number"
                step="0.01"
                min="0"
                value={formData.price_usd}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                placeholder="25.00"
              />
              <p className="text-xs text-gray-500 mt-1">
                {tr(
                  'Optional. Set by hand — it is not converted from IDR. Leave empty to show the IDR price to English visitors.',
                  'Opsional. Diisi manual — tidak dikonversi dari IDR. Kosongkan agar pengunjung bahasa Inggris tetap melihat harga IDR.'
                )}
              </p>
            </div>

            <div>
              <label htmlFor="stock" className="block text-sm font-medium mb-2 text-black">
                {tr('Stock *', 'Stok *')}
              </label>
              <input
                id="stock"
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
              />
            </div>
          </div>

          {/* Shipping dimensions. Couriers bill the larger of actual and
              volumetric weight, so packed box size drives the price too. */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-base font-semibold text-black mb-1">
              {tr('Shipping Dimensions', 'Dimensi Pengiriman')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {tr(
                'Leave blank to use the store default weight set under Shipping.',
                'Kosongkan untuk memakai berat default toko di menu Pengiriman.'
              )}
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="weight_grams" className="block text-sm font-medium mb-2 text-black">
                  {tr('Weight (g)', 'Berat (g)')}
                </label>
                <input
                  id="weight_grams"
                  name="weight_grams"
                  type="number"
                  min="0"
                  value={formData.weight_grams}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                  placeholder="500"
                />
              </div>
              <div>
                <label htmlFor="length_cm" className="block text-sm font-medium mb-2 text-black">
                  {tr('Length (cm)', 'Panjang (cm)')}
                </label>
                <input
                  id="length_cm"
                  name="length_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.length_cm}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                  placeholder="30"
                />
              </div>
              <div>
                <label htmlFor="width_cm" className="block text-sm font-medium mb-2 text-black">
                  {tr('Width (cm)', 'Lebar (cm)')}
                </label>
                <input
                  id="width_cm"
                  name="width_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.width_cm}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                  placeholder="25"
                />
              </div>
              <div>
                <label htmlFor="height_cm" className="block text-sm font-medium mb-2 text-black">
                  {tr('Height (cm)', 'Tinggi (cm)')}
                </label>
                <input
                  id="height_cm"
                  name="height_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.height_cm}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                  placeholder="10"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="hs_code" className="block text-sm font-medium mb-2 text-black">
                {tr('HS Code (for international shipping)', 'Kode HS (untuk kirim luar negeri)')}
              </label>
              <input
                id="hs_code"
                name="hs_code"
                type="text"
                value={formData.hs_code}
                onChange={handleChange}
                className="w-full max-w-xs px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 text-black"
                placeholder="6109.10"
              />
            </div>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium mb-2 text-black">
              {tr('Category *', 'Kategori *')}
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-black"
            >
              {categories.length === 0 ? (
                <option value="">{tr('Loading categories...', 'Memuat kategori...')}</option>
              ) : (
                categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-black">
              {tr('Product Images', 'Gambar Produk')}
            </label>
            <MultiImageUpload
              onImagesChange={(urls) => setFormData((prev) => ({ ...prev, images: urls }))}
              initialImages={formData.images}
            />
          </div>

          <ProductColorsEditor
            value={colors}
            onChange={setColors}
            galleryImages={formData.images}
          />

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 btn-primary-animated"
            >
              {saving ? tr('Saving...', 'Menyimpan...') : tr('Save Changes', 'Simpan Perubahan')}
            </button>
            <Link
              href="/admin/dashboard"
              className="flex-1 py-3 text-center btn-secondary-animated"
            >
              {tr('Cancel', 'Batal')}
            </Link>
          </div>
        </form>
      </div>

      {/* Notification */}
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  )
}
