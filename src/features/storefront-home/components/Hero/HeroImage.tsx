// src/components/storefront/Hero/HeroImage.tsx
'use client'; 

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

export interface HeroImageProps extends Omit<ImageProps, 'alt'> {
  src: string;
  alt: string;
  priority?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
  className?: string;
}

export function HeroImage({
  src,
  alt,
  priority = false,
  fetchPriority = 'auto',
  sizes = '100vw',
  className,
  ...props
}: HeroImageProps) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Image
        src={imageError ? '/placeholder.png' : src}
        alt={alt}
        fill
        priority={priority}
        fetchPriority={fetchPriority}
        sizes={sizes}
        // 🌟 دمج الـ className الممرر بأمان للحفاظ على object-top لمنع الـ Shifts
        className={cn("object-cover transition-transform duration-500", className)}
        onError={() => setImageError(true)}
        {...props}
      />
    </div>
  );
}