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

  const validDesktop = payload.desktopImages?.filter((img) => img && !img.includes('default-banner.png')) || [];
  const validMobile = payload.mobileImages?.filter((img) => img && !img.includes('default-banner.png')) || [];

  const desktopImages = validDesktop;
  const mobileImages = validMobile.length > 0 ? validMobile : desktopImages;

  const hasImage = desktopImages.length > 0 || mobileImages.length > 0;
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const maxSlides = Math.max(desktopImages.length, mobileImages.length);
    if (maxSlides <= 1) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % maxSlides);
    }, 5000);

    return () => clearInterval(interval);
  }, [desktopImages.length, mobileImages.length]);

  const currentDesktop = desktopImages[currentSlide] || desktopImages[0];
  const currentMobile = mobileImages[currentSlide] || currentDesktop;

  return (
    <section 
      className={cn(
        "relative w-full overflow-hidden flex items-center justify-center bg-transparent",
        hasImage ? "h-[40vh] min-h-[320px] md:h-[550px] lg:h-[600px]" : "bg-gradient-to-b from-slate-100 to-white dark:from-slate-900 dark:to-slate-950 py-20 md:py-32",
        className
      )}
      data-testid="storefront-hero"
    >
      {/* 1. حاوية الخلفية والـ Mask */}
      {hasImage && (
        <div 
          className="absolute inset-0 z-0"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
          }}
        >
          <div className="absolute inset-0 transition-opacity duration-1000 ease-in-out z-10">
            <HeroImage 
              src={currentMobile || currentDesktop} 
              alt={title || "Hero Banner Image"} 
              priority={currentSlide === 0} 
              fetchPriority={currentSlide === 0 ? "high" : "auto"}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
              className="w-full h-full object-cover object-top" 
            />
          </div>
          
          {/* زيادة التظليل قليلاً لرفع تباين النصوص العلوية */}
          <div className="absolute inset-0 bg-black/40 z-15" />
        </div>
      )}

      {/* 👑 طبقة الضباب العلوي */}
      {hasImage && (
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 via-black/30 to-transparent z-25 pointer-events-none" />
      )}

      {/* 2. كتلة المحتوى */}
      <div className="relative z-30 w-full max-w-7xl mx-auto px-6 flex flex-col items-center justify-center text-center pt-24 pb-12 md:pt-32 md:pb-16">
        <div className="max-w-2xl flex flex-col items-center select-none">
          
          <h1 className={cn(
            "text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.15] mb-4",
            hasImage ? "text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]" : "text-slate-950 dark:text-slate-50"
          )}>
            {title}
          </h1>
          
          {description && (
            <p className={cn(
              "text-xs sm:text-sm md:text-lg font-medium leading-relaxed max-w-lg mb-6",
              hasImage ? "text-slate-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" : "text-slate-800 dark:text-slate-200"
            )}>
              {description}
            </p>
          )}

          {/* زر الـ CTA الديناميكي بتمرير تباين مضمون 100% */}
          {ctaText && ctaLink && (
            <div className="drop-shadow-[0_6px_15px_rgba(0,0,0,0.4)]">
              <Link 
                href={ctaLink}
                prefetch={false}
                aria-label={ctaText}
                className={cn(
                  "inline-flex items-center justify-center px-8 py-3 md:px-10 md:py-3.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 transform active:scale-95 shadow-lg",
                  // 🛡️ استخدام خلفية أغمق مع نص أبيض واضح يحقق أرقام تباين قياسية لكل الاختبارات
                  "bg-slate-950 text-white hover:bg-slate-800",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                )}
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