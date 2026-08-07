//src/features/storefront-home/components/CategoryList/CategoryCard.tsx
import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@/lib/db/schema/categories';

interface CategoryCardProps {
  category: Category;
  storeSlug: string;
}

export function CategoryCard({ category, storeSlug }: CategoryCardProps) {
  const { name, slug, image, productsCount } = category;

  return (
    <Link
      href={`/${storeSlug}/categories/${slug}`}
      className="group flex flex-col items-center justify-center p-4 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-200 hover:-translate-y-1"
    >
      <div className="relative w-20 h-20 mb-3 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-50">
        {image ? (
          <Image
            src={image}
            alt={name}
            fill
            sizes="80px"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <span className="text-2xl font-bold text-slate-400 select-none">
            {name.charAt(0)}
          </span>
        )}
      </div>

      <span className="text-sm font-semibold text-slate-800 text-center transition-colors group-hover:text-primary line-clamp-1">
        {name}
      </span>

      {typeof productsCount === 'number' && productsCount > 0 && (
        <span className="text-xs text-slate-400 mt-1 font-normal">
          {productsCount} منتج
        </span>
      )}
    </Link>
  );
}