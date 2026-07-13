// src/components/storefront/Hero/Hero.tsx
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { HeroImage } from './HeroImage';
import type { HeroAdapterResult } from './Hero.adapter';

export interface HeroProps {
  payload: HeroAdapterResult & {
    desktopImages?: string[];
    mobileImages?: string[]; 
  };
  className?: string;
}

export function Hero({ payload, className }: HeroProps) {
  const { title, description, ctaText, ctaLink } = payload;

  const defaultDesktopImages = [
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop"
  ];

  const desktopImages = payload.desktopImages && payload.desktopImages.length > 0 
    ? payload.desktopImages 
    : defaultDesktopImages;

  const mobileImages = payload.mobileImages && payload.mobileImages.length > 0
    ? payload.mobileImages
    : desktopImages;

  const hasImage = desktopImages.length > 0 || mobileImages.length > 0;

  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (desktopImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % desktopImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [desktopImages]);

  return (
    <section 
      className={cn(
        "relative w-full overflow-hidden flex items-center justify-center bg-transparent",
        // 🌟 تثبيت الارتفاع: في الموبايل مرن، وفي الشاشات الكبيرة يقف عند h-[550px] كحد أقصى مريح للعين
        hasImage ? "h-[40vh] min-h-[320px] md:h-[550px] lg:h-[600px]" : "bg-gradient-to-b from-slate-50 to-white py-20 md:py-32",
        className
      )}
      data-testid="storefront-hero"
    >
      {/* 1. حاوية الخلفية والـ Mask */}
      {hasImage && (
        <div 
          className="absolute inset-0 z-0"
          style={{
            // تلاشي ناعم يبدأ مبكراً ليحافظ على دمج أطراف الصورة مهما كبرت الشاشة
            WebkitMaskImage: 'linear-gradient(to bottom, black 50%, rgba(0,0,0,0.3) 80%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, black 50%, rgba(0,0,0,0.3) 80%, transparent 100%)',
          }}
        >
          {/* 📱 سلايدر الموبايل */}
          <div className="block md:hidden absolute inset-0">
            {mobileImages.map((src, index) => (
              <div
                key={`mobile-${src}`}
                className={cn(
                  "absolute inset-0 transition-opacity duration-1000 ease-in-out",
                  index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"
                )}
              >
                <HeroImage src={src} alt={title || "Hero Mobile Image"} priority={index === 0} className="w-full h-full object-cover object-top" />
              </div>
            ))}
          </div>

          {/* 💻 سلايدر الكمبيوتر الثابت ذو الارتفاع المحكوم */}
          <div className="hidden md:block absolute inset-0">
            {desktopImages.map((src, index) => (
              <div
                key={`desktop-${src}`}
                className={cn(
                  "absolute inset-0 transition-opacity duration-1000 ease-in-out",
                  index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"
                )}
              >
                <HeroImage 
                  src={src} 
                  alt={`${title || "Hero Desktop Image"} - Slide ${index + 1}`} 
                  priority={index === 0} 
                  className="w-full h-full object-cover object-top" 
                />
              </div>
            ))}
          </div>
          
          <div className="absolute inset-0 bg-black/5 z-15" />
        </div>
      )}

      {/* 👑 طبقة الضباب العلوي الثابتة (البريمو) */}
      {hasImage && (
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white via-white/80 to-transparent z-25 pointer-events-none" />
      )}

      {/* 2. كتلة المحتوى: تم تقليل الـ Padding والاعتماد على ارتفاع الحاوية الأب لإعطاء مظهر متناسق ومتوازن دائماً */}
      <div className="relative z-30 w-full max-w-7xl mx-auto px-6 flex flex-col items-center justify-center text-center pt-24 pb-12 md:pt-32 md:pb-16">
        <div className="max-w-2xl flex flex-col items-center select-none">
          
          <h1 className={cn(
            "text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.15] mb-4",
            hasImage ? "text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]" : "text-slate-900"
          )}>
            {title}
          </h1>
          
          {description && (
            <p className={cn(
              "text-xs sm:text-sm md:text-lg font-medium leading-relaxed max-w-lg mb-6",
              hasImage ? "text-slate-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" : "text-slate-600"
            )}>
              {description}
            </p>
          )}

          {/* زر الـ CTA الذهبي */}
          {ctaText && ctaLink && (
            <div className="drop-shadow-[0_6px_15px_rgba(0,0,0,0.3)]">
              <Link 
                href={ctaLink}
                className="inline-flex items-center justify-center px-8 py-3 md:px-10 md:py-3.5 rounded-full text-xs md:text-sm font-bold bg-[#D4AF37] text-black hover:bg-[#bfa032] hover:scale-105 transition-all duration-300 transform active:scale-95 shadow-lg shadow-[#D4AF37]/10"
              >
                {ctaText}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}