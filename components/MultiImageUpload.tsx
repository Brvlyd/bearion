'use client'

import { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, X, Image as ImageIcon, GripVertical, Crop } from 'lucide-react'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n'
import { getErrorMessage } from '@/lib/errors'
import ImageEditorModal from './ImageEditorModal'
import LoadingSpinner from './LoadingSpinner'

interface MultiImageUploadProps {
  onImagesChange: (urls: string[]) => void
  initialImages?: string[]
}

export default function MultiImageUpload({ onImagesChange, initialImages = [] }: MultiImageUploadProps) {
  const { tr } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [images, setImages] = useState<string[]>(initialImages)
  const [error, setError] = useState('')
  // Selected files wait here and are edited one by one before any upload runs.
  const [editQueue, setEditQueue] = useState<File[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [reeditIndex, setReeditIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setImages(initialImages)
  }, [initialImages])

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const uploadFile = async (file: File): Promise<string> => {
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

    return publicUrl
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      queueFilesForEditing(Array.from(e.dataTransfer.files))
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files.length > 0) {
      queueFilesForEditing(Array.from(e.target.files))
    }
  }

  /** Validates the picked files and lines them up for the live editor. */
  const queueFilesForEditing = (files: File[]) => {
    setError('')

    const invalidType = files.find(file => !file.type.startsWith('image/'))
    if (invalidType) {
      setError(tr('Please upload an image file', 'Silakan unggah file gambar'))
      return
    }

    const tooLarge = files.find(file => file.size > 5 * 1024 * 1024)
    if (tooLarge) {
      setError(tr('Image size should be less than 5MB', 'Ukuran gambar harus kurang dari 5MB'))
      return
    }

    setReeditIndex(null)
    setQueueIndex(0)
    setEditQueue(files)
  }

  const closeEditor = () => {
    setEditQueue([])
    setQueueIndex(0)
    setReeditIndex(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  /** Uploads the framed result, then moves on to the next queued file. */
  const updateImages = (nextImages: string[]) => {
    setImages(nextImages)
    onImagesChange(nextImages)
  }

  const handleEditorApply = async (editedFile: File) => {
    setUploading(true)
    setError('')

    try {
      const publicUrl = await uploadFile(editedFile)

      if (reeditIndex !== null) {
        const newImages = images.map((url, index) => (index === reeditIndex ? publicUrl : url))
        updateImages(newImages)
        setReeditIndex(null)
        return
      }

      const newImages = [...images, publicUrl]
      updateImages(newImages)

      if (queueIndex + 1 < editQueue.length) {
        setQueueIndex(queueIndex + 1)
      } else {
        closeEditor()
      }
    } catch (error) {
      console.error('Upload error:', error)
      setError(getErrorMessage(error) || 'Failed to upload images')
      closeEditor()
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async (index: number) => {
    const imageUrl = images[index]
    
    // Try to delete from storage if it's a Supabase URL
    if (imageUrl && imageUrl.includes('supabase')) {
      try {
        const urlParts = imageUrl.split('/product-images/')
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
    
    const newImages = images.filter((_, i) => i !== index)
    updateImages(newImages)
  }

  const moveImage = (fromIndex: number, toIndex: number) => {
    const newImages = [...images]
    const [movedImage] = newImages.splice(fromIndex, 1)
    newImages.splice(toIndex, 0, movedImage)
    updateImages(newImages)
  }

  return (
    <div>
      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          {images.map((url, index) => (
            <div key={index} className="relative group">
              <div className="relative w-full h-48 border-2 border-gray-300 rounded-lg bg-gray-50 p-3">
                <div className="relative w-full h-full">
                  <Image
                    src={url}
                    alt={`Product ${index + 1}`}
                    fill
                    className="object-contain rounded"
                    onError={() => {
                      setError(tr('Failed to load image', 'Gagal memuat gambar'))
                    }}
                  />
                </div>
                
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition shadow-lg opacity-0 group-hover:opacity-100"
                  title={tr('Remove image', 'Hapus gambar')}
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Reorder buttons */}
                <div className="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100">
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => moveImage(index, index - 1)}
                      className="bg-black/70 text-white p-1 rounded hover:bg-black transition"
                      title={tr('Move left', 'Pindah ke kiri')}
                    >
                      <GripVertical className="w-3 h-3 rotate-90" />
                    </button>
                  )}
                  {index < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveImage(index, index + 1)}
                      className="bg-black/70 text-white p-1 rounded hover:bg-black transition"
                      title={tr('Move right', 'Pindah ke kanan')}
                    >
                      <GripVertical className="w-3 h-3 -rotate-90" />
                    </button>
                  )}
                </div>

                {/* Image number badge */}
                <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                  {index + 1}
                </div>

                {/* Re-frame an image that is already stored */}
                <button
                  type="button"
                  onClick={() => {
                    setEditQueue([])
                    setReeditIndex(index)
                  }}
                  className="absolute bottom-1 right-1 bg-black/70 text-white px-2 py-1 rounded text-xs inline-flex items-center gap-1 hover:bg-black transition opacity-0 group-hover:opacity-100"
                  title={tr('Adjust image size', 'Sesuaikan ukuran gambar')}
                >
                  <Crop className="w-3 h-3" />
                  {tr('Adjust', 'Atur')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition ${
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
          multiple
        />
        
        <div className="flex flex-col items-center">
          {uploading ? (
            <LoadingSpinner label={tr('Uploading...', 'Mengunggah...')} />
          ) : (
            <>
              <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-black font-medium mb-2">
                {tr('Drag & drop images here', 'Seret & lepas gambar di sini')}
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
                {tr('PNG, JPG, GIF up to 5MB each (multiple files supported)', 'PNG, JPG, GIF hingga 5MB per file (mendukung banyak file)')}
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mt-3">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
        <p className="text-sm text-blue-800">
          <strong>{tr('Tip', 'Tips')}:</strong> {tr('Every picked image opens in the live editor first, so you can crop and resize it before it goes public.', 'Setiap gambar yang dipilih dibuka dulu di editor live, jadi Anda bisa memotong dan mengubah ukurannya sebelum tayang.')}
          {tr('The first image will be the main display.', 'Gambar pertama akan menjadi tampilan utama.')}
        </p>
      </div>

      <ImageEditorModal
        open={editQueue.length > 0 || reeditIndex !== null}
        file={reeditIndex === null ? editQueue[queueIndex] || null : null}
        sourceUrl={reeditIndex !== null ? images[reeditIndex] : null}
        defaultFit="contain"
        recommendedWidth={1200}
        recommendedHeight={1200}
        title={
          reeditIndex !== null
            ? tr(`Adjust image ${reeditIndex + 1}`, `Sesuaikan gambar ${reeditIndex + 1}`)
            : tr(
                `Adjust image ${queueIndex + 1} of ${editQueue.length}`,
                `Sesuaikan gambar ${queueIndex + 1} dari ${editQueue.length}`
              )
        }
        onCancel={closeEditor}
        onApply={handleEditorApply}
      />
    </div>
  )
}
