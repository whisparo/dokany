//src/features/storefront-home/components/CategoryList/CategoryList.tsx
import { CategoryCard } from './CategoryCard';
import type { Category } from '@/lib/db/schema/categories';

interface CategoryListProps {
  categories: Category[];
  storeSlug: string;
  title?: string;
}

export function CategoryList({
  categories,
  storeSlug,
  title = 'تصفح حسب الأقسام',
}: CategoryListProps) {
  // تصفية الأقسام النشطة فقط في الـ UI تحسباً
  const activeCategories = categories.filter((cat) => cat.isActive);

  if (!activeCategories || activeCategories.length === 0) {
    return null;
  }

  return (
    <section className="py-8 w-full container mx-auto px-4" dir="rtl">
      {title && (
        <h2 className="text-2xl font-bold text-slate-900 mb-6 text-right">
          {title}
        </h2>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {activeCategories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            storeSlug={storeSlug}
          />
        ))}
      </div>
    </section>
  );
}