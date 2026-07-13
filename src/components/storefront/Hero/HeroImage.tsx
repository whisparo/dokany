// src/components/storefront/Hero/HeroImage.tsx
'use client'; 

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface HeroImageProps {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}

export function HeroImage({ src, alt, priority = false, className }: HeroImageProps) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Image
        src={imageError ? '/placeholder.png' : src}
        alt={alt}
        fill
        priority={priority}
        sizes="100vw"
        // 🌟 الحلال هنا: object-cover بتخلي الصورة تقص الزيادات تلقائياً بدل ما تمط
        // و object-center (أو object-bottom لو عاوز الصورة تنزل لتحت) بتضبط نقطة الارتكاز
        className={cn("object-cover object-center transition-transform duration-500", className)}
        onError={() => setImageError(true)}
      />
    </div>
  );
}