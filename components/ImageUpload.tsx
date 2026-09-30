'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, X, Image as ImageIcon, Crop } from 'lucide-react'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n'
import { getErrorMessage } from '@/lib/errors'
import ImageEditorModal from './ImageEditorModal'
import LoadingSpinner from './LoadingSpinner'

interface ImageUploadProps {
  currentImageUrl?: string
  onImageChange: (url: string) => void
}

export default function ImageUpload({ currentImageUrl, onImageChange }: ImageUploadProps) {
  const { tr } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl || '')
  const [error, setError] = useState('')
  // Nothing reaches storage until the admin approves the framing in the editor.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [editingUrl, setEditingUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const uploadFile = async (file: File) => {
    try {
      setUploading(true)
      setError('')

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error(tr('Please upload an image file', 'Silakan unggah file gambar'))
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(tr('Image size should be less than 5MB', 'Ukuran gambar harus kurang dari 5MB'))
      }

      // Create unique file name
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `products/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)

      setPreviewUrl(publicUrl)
      onImageChange(publicUrl)
      
    } catch (error) {
      console.error('Upload error:', error)
      setError(getErrorMessage(error) || 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  /** Validates a picked file, then hands it to the live editor before uploading. */
  const openEditorFor = (file: File) => {
    setError('')

    if (!file.type.startsWith('image/')) {
      setError(tr('Please upload an image file', 'Silakan unggah file gambar'))
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(tr('Image size should be less than 5MB', 'Ukuran gambar harus kurang dari 5MB'))
      return
    }

    setEditingUrl(null)
    setPendingFile(file)
  }

  const handleEditorApply = async (editedFile: File) => {
    setPendingFile(null)
    setEditingUrl(null)
    await uploadFile(editedFile)
  }

  const closeEditor = () => {
    setPendingFile(null)
    setEditingUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      openEditorFor(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      openEditorFor(e.target.files[0])
    }
  }

  const handleRemove = async () => {
    if (previewUrl && previewUrl.includes('supabase')) {
      try {
        // Extract file path from URL
        const urlParts = previewUrl.split('/product-images/')
        if (urlParts.length > 1) {
          const filePath = urlParts[1]
          await supabase.storage
            .from('product-images')
            .remove([`products/${filePath.split('/').pop()}`])
        }
      } catch (error) {
        console.error('Error removing file:', error)
      }
    }
    
    setPreviewUrl('')
    onImageChange('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-black">
        {tr('Product Image', 'Gambar Produk')}
      </label>

      {previewUrl ? (
        <div className="space-y-3">
          <div className="relative w-auto h-96 border-2 border-gray-300 rounded-lg bg-gray-50 px-10 py-4">
            <div className="relative w-full h-full">
              <Image
                src={previewUrl}
                alt={tr('Product preview', 'Pratinjau produk')}
                fill
                className="object-contain"
                onError={() => {
                  setError(tr('Failed to load image', 'Gagal memuat gambar'))
                  setPreviewUrl('')
                }}
              />
            </div>
            <div className="absolute top-2 right-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null)
                  setEditingUrl(previewUrl)
                }}
                className="bg-black text-white px-2.5 py-1.5 rounded-full hover:bg-gray-800 transition shadow-lg inline-flex items-center gap-1.5 text-xs"
                title={tr('Adjust image size', 'Sesuaikan ukuran gambar')}
              >
                <Crop className="w-3.5 h-3.5" />
                {tr('Adjust size', 'Atur ukuran')}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition shadow-lg"
                title={tr('Remove image', 'Hapus gambar')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            {tr('Use Adjust size to re-crop or resize, or the X button to remove the image.', 'Gunakan Atur ukuran untuk memotong/mengubah ukuran, atau tombol X untuk menghapus gambar.')}
          </p>
        </div>
      ) : (
        <div
          className={`relative border-2 border-dashed rounded-lg p-12 text-center transition ${
            dragActive
              ? 'border-black bg-gray-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
            disabled={uploading}
          />
          
          <div className="flex flex-col items-center">
            {uploading ? (
              <LoadingSpinner label={tr('Uploading...', 'Mengunggah...')} />
            ) : (
              <>
                <ImageIcon className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-black font-medium mb-2">
                  {tr('Drag & drop an image here', 'Seret & lepas gambar di sini')}
                </p>
                <p className="text-sm text-gray-500 mb-4">{tr('or', 'atau')}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {tr('Browse Files', 'Pilih File')}
                </button>
                <p className="text-xs text-gray-500 mt-4">
                  {tr('PNG, JPG, GIF up to 5MB', 'PNG, JPG, GIF hingga 5MB')}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mt-3">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
        <p className="text-sm text-blue-800">
          <strong>{tr('Tip', 'Tips')}:</strong> {tr('After picking a file you can crop and resize it live before it is published.', 'Setelah memilih file, Anda bisa memotong dan mengubah ukurannya secara live sebelum dipublikasikan.')}
          {tr('For best results, use square images (1:1 ratio) at least 800x800px.', 'Untuk hasil terbaik, gunakan gambar persegi (rasio 1:1) minimal 800x800px.')}
        </p>
      </div>

      <ImageEditorModal
        open={!!pendingFile || !!editingUrl}
        file={pendingFile}
        sourceUrl={editingUrl}
        defaultFit="contain"
        recommendedWidth={1200}
        recommendedHeight={1200}
        title={tr('Adjust product image', 'Sesuaikan gambar produk')}
        onCancel={closeEditor}
        onApply={handleEditorApply}
      />
    </div>
  )
}
