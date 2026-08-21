// src/dashboard/products-page/CategoryFilterRibbon.tsx

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Button from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge/Badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shared/DropdownMenu/DropdownMenu';
import type { CategoryFilterOption } from '@/dashboard/categories-management/types/category.types';

export interface CategoryFilterRibbonProps {
  categories: CategoryFilterOption[];
  selectedCategoryId: string | null;
  onSelect: (id: string | null) => void;
  isLoading: boolean;
}

export function CategoryFilterRibbon({
  categories,
  selectedCategoryId,
  onSelect,
  isLoading,
}: CategoryFilterRibbonProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>
    );
  }

  const rootCategories = categories.filter((c) => c.level === 0);

  // حساب إجمالي منتجات الأقسام الرئيسية فقط لتجنب التكرار
  const totalProductsCount = rootCategories.reduce(
    (acc, c) => acc + (c.productsCount || 0),
    0
  );

  return (
    <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2">
      <Button
        variant={selectedCategoryId === null ? 'primary' : 'outline'}
        size="sm"
        className="rounded-full"
        onClick={() => onSelect(null)}
      >
        الكل
        <Badge variant="secondary" className="ms-1">
          {totalProductsCount}
        </Badge>
      </Button>

      {rootCategories.map((category) => {
        const hasChildren = category.children && category.children.length > 0;

        // التحقق مما إذا كان القسم أو أحد أبنائه محدد
        const isChildSelected = category.children?.some(
          (child) => child.id === selectedCategoryId
        );
        const isParentSelected = selectedCategoryId === category.id;
        const isActive = isParentSelected || isChildSelected;

        if (hasChildren) {
          return (
            <DropdownMenu
              key={category.id}
              open={openDropdown === category.id}
              onOpenChange={(open: boolean) => setOpenDropdown(open ? category.id : null)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isActive ? 'primary' : 'outline'}
                  size="sm"
                  className="rounded-full"
                >
                  {category.name}
                  <Badge variant="secondary" className="ms-1">
                    {category.productsCount || 0}
                  </Badge>
                  <ChevronDown className="ms-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => onSelect(category.id)}>
                  {category.name} (الكل)
                </DropdownMenuItem>
                {category.children?.map((child) => (
                  <DropdownMenuItem
                    key={child.id}
                    onClick={() => onSelect(child.id)}
                    className="flex items-center justify-between ps-4"
                  >
                    <span className="flex items-center gap-1">
                      <span className="text-muted-foreground">└</span>
                      {child.name}
                    </span>
                    <Badge variant="secondary" className="ms-auto">
                      {child.productsCount || 0}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <Button
            key={category.id}
            variant={selectedCategoryId === category.id ? 'primary' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => onSelect(category.id)}
          >
            {category.name}
            <Badge variant="secondary" className="ms-1">
              {category.productsCount || 0}
            </Badge>
          </Button>
        );
      })}
    </div>
  );
}