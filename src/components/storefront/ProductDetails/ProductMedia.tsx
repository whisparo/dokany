'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Play, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductDetailsAdapterResult, ProductMedia as MediaType } from './ProductDetails.adapter';

interface ProductMediaProps {
  data: ProductDetailsAdapterResult;
  theme: any;
}

export function ProductMedia({ data, theme }: ProductMediaProps) {
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const activeMedia = data.mediaGallery[selectedMediaIndex] || data.mainMedia;

  const handleMediaChange = (index: number) => {
    setSelectedMediaIndex(index);
    setIsPlayingVideo(false);
  };

  return (
    <div className={theme.mediaSection}>
      {/* الحاوية الكبرى */}
      <div 
        className={cn(
          theme.mediaWrapper,
          'cursor-zoom-in rounded-[1.5rem] md:rounded-[2rem] overflow-hidden'
        )}
        onClick={() => activeMedia.type !== 'video' && setIsZoomed(true)}
      >
        {activeMedia.type === 'video' ? (
          <div className="relative h-full w-full">
            {isPlayingVideo ? (
              <iframe
                src={`${activeMedia.url}${activeMedia.url.includes('?') ? '&' : '?'}autoplay=1`}
                className={theme.videoPlayer}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={data.name}
              />
            ) : (
              <div className="relative h-full w-full cursor-pointer" onClick={() => setIsPlayingVideo(true)}>
                <Image
                  src={activeMedia.thumbnailUrl || data.mainMedia.url}
                  alt={data.name}
                  fill
                  className={cn(theme.media, 'object-cover md:object-contain')}
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                <div className={theme.videoOverlay}>
                  <button type="button" className={theme.playButton} aria-label="تشغيل الفيديو">
                    <Play className="h-8 w-8 fill-current" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Image
            src={activeMedia.url}
            alt={`صورة المنتج: ${data.name}`}
            fill
            className={cn(theme.media, 'object-cover md:object-contain')}
            style={{ objectPosition: 'top center' }}
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        )}

        {/* وسوم التسويق الذكية */}
        {data.urgencyBadge && (
          <div className={theme.badges}>
            <span className={theme.urgencyBadge(data.urgencyBadge.variant)}>
              {data.urgencyBadge.variant === 'danger' && <AlertCircle className="me-1 h-3.5 w-3.5" />}
              {data.urgencyBadge.text}
            </span>
          </div>
        )}
      </div>

      {/* معرض المصغرات */}
      {data.mediaGallery.length > 1 && (
        <div className={theme.thumbnailGrid}>
          {data.mediaGallery.map((media, index) => (
            <button
              key={media.id}
              type="button"
              onClick={() => handleMediaChange(index)}
              className={theme.thumbnail(index === selectedMediaIndex, media.type === 'video')}
              aria-label={`عرض عنصر الميديا ${index + 1}`}
              aria-pressed={index === selectedMediaIndex}
            >
              <Image
                src={media.type === 'video' ? (media.thumbnailUrl || data.mainMedia.url) : media.url}
                alt=""
                fill
                className={cn(theme.thumbnailImage, 'object-cover')}
                sizes="(max-width: 768px) 20vw, 10vw"
              />
              {media.type === 'video' && (
                <div className={theme.thumbnailVideoIndicator}>
                  <Play className="h-4 w-4 fill-current" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* نافذة تكبير الصورة السينمائية */}
      {isZoomed && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md transition-all duration-300 animate-in fade-in"
          onClick={() => setIsZoomed(false)}
        >
          <button 
            type="button"
            className="absolute top-6 right-6 text-white hover:text-slate-300 bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all focus:outline-none"
            onClick={() => setIsZoomed(false)}
          >
            <X className="h-6 w-6" />
          </button>

          <div className="relative max-w-[90vw] max-h-[90vh] aspect-auto flex items-center justify-center">
            <img 
              src={activeMedia.url} 
              alt={data.name}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl scale-95 animate-in zoom-in-95 duration-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}