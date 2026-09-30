'use client'

import Image from 'next/image'
import { useState } from 'react'
import { getImageUrl, getCategoryPlaceholder } from '@/lib/image-utils'

interface SafeImageProps {
  src: string | null | undefined
  alt: string
  fill?: boolean
  width?: number
  height?: number
  className?: string
  priority?: boolean
  category?: string
  sizes?: string
  /**
   * How the bitmap fills its box. Set as an inline style because that is what
   * next/image itself does — a Tailwind `object-contain` class on the same
   * element loses to it — so anything but 'cover' has to be asked for here.
   */
  objectFit?: 'cover' | 'contain'
  /** Fires with the loaded <img>, so callers can read naturalWidth/Height. */
  onLoad?: (image: HTMLImageElement) => void
}

/**
 * SafeImage Component
 * Handles image loading errors gracefully with fallback to placeholder
 */
export default function SafeImage({
  src,
  alt,
  fill = false,
  width,
  height,
  className = '',
  priority = false,
  category,
  sizes,
  objectFit = 'cover',
  onLoad,
}: SafeImageProps) {
  // Remember which src failed rather than copying src into state: a new src
  // prop then gets its own attempt automatically, with no effect to resync.
  const resolvedSrc = getImageUrl(src)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const hasError = failedSrc === resolvedSrc

  const imageSrc = hasError
    ? category
      ? getCategoryPlaceholder(category)
      : getImageUrl(null)
    : resolvedSrc

  const handleError = () => {
    if (!hasError) setFailedSrc(resolvedSrc)
  }

  const altText = alt || 'Product image'

  const imageProps = {
    src: imageSrc,
    className: `${className} ${hasError ? 'opacity-75' : ''}`,
    onError: handleError,
    onLoad: onLoad ? (event: React.SyntheticEvent<HTMLImageElement>) => onLoad(event.currentTarget) : undefined,
    unoptimized: true,
    priority,
    sizes: sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  }

  if (fill) {
    // `fill` positions the image absolutely, so it needs its own relatively
    // positioned box here rather than trusting every call site to remember
    // one — otherwise the image escapes to the nearest positioned ancestor
    // and can balloon far past the intended container.
    return (
      <div className="relative w-full h-full">
        <Image
          {...imageProps}
          alt={altText}
          fill
          style={{ objectFit }}
        />
      </div>
    )
  }

  if (width && height) {
    return (
      <Image
        {...imageProps}
        alt={altText}
        width={width}
        height={height}
        style={{ objectFit, width: '100%', height: 'auto' }}
      />
    )
  }

  // Fallback to fill if no dimensions provided
  return (
    <div className="relative w-full h-full">
      <Image
        {...imageProps}
        alt={altText}
        fill
        style={{ objectFit }}
      />
    </div>
  )
}
