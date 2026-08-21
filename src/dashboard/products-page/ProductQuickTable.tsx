// src/dashboard/products-page/ProductQuickTable.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, MoreVertical, Edit2 } from 'lucide-react';
import { useLocale } from 'next-intl';

import Button from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge/Badge';
import { Input } from '@/components/shared/Input/Input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shared/table/Table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shared/DropdownMenu/DropdownMenu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/Dialog/Dialog';
import type { Product } from '@/lib/db/schema/products';

// تعريض النوع ليتوافق مع بيانات الـ API/UI بدون تعارض مع سكيما الداتابيز
export type ProductQuickTableItem = Omit<Product, 'images'> & {
  images?: Array<{ url: string }> | unknown;
};

export interface ProductQuickTableProps {
  products: ProductQuickTableItem[];
  isLoading: boolean;
  onStockUpdate: (id: string, newStock: number) => void;
  onDelete: (id: string) => void;
}

export function ProductQuickTable({
  products,
  isLoading,
  onStockUpdate,
  onDelete,
}: ProductQuickTableProps) {
  const router = useRouter();
  const [editingStock, setEditingStock] = useState<{ id: string; value: number } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string; name: string }>({
    open: false,
    id: '',
    name: '',
  });

  const locale = useLocale();
  const isRTL = locale === 'ar';

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">لا توجد منتجات في هذا القسم</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/dashboard/products/new')}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة منتج جديد
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">المنتج</TableHead>
              <TableHead>القسم</TableHead>
              <TableHead className="text-left">السعر</TableHead>
              <TableHead className="text-left">المخزون</TableHead>
              <TableHead className="text-left">الحالة</TableHead>
              <TableHead className="w-[100px] text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              // استخراج رابط الصورة بأمان بغض النظر عن شكل الـ JSON
              const firstImage = Array.isArray(product.images)
                ? (product.images[0] as { url?: string } | undefined)?.url
                : undefined;

              const lowThreshold = product.lowStockThreshold ?? 5;
              const isLowStock = product.stock <= lowThreshold;

              return (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {firstImage ? (
                        <div className="relative h-10 w-10 overflow-hidden rounded bg-muted">
                          <Image
                            src={firstImage}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          لا صورة
                        </div>
                      )}
                      <div>
                        <div className="line-clamp-1">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku || 'بدون SKU'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{product.categoryId || 'بدون قسم'}</TableCell>
                  <TableCell className="text-left font-mono">
                    {(product.price / 100).toFixed(2)} ريال
                  </TableCell>
                  <TableCell className="text-left">
                    {editingStock?.id === product.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          value={isNaN(editingStock.value) ? '' : editingStock.value}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setEditingStock({
                              id: product.id,
                              value: isNaN(val) ? 0 : val,
                            });
                          }}
                          className="h-8 w-20"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newStock = Math.max(0, editingStock.value || 0);
                            onStockUpdate(product.id, newStock);
                            setEditingStock(null);
                          }}
                        >
                          حفظ
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingStock(null)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono ${isLowStock ? 'font-bold text-red-500' : ''}`}
                        >
                          {product.stock}
                        </span>
                        {isLowStock && (
                          <Badge variant="danger" className="text-xs">
                            منخفض
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() =>
                            setEditingStock({ id: product.id, value: product.stock })
                          }
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    {product.isPublished ? (
                      <Badge variant="success">منشور</Badge>
                    ) : (
                      <Badge variant="secondary">مسودة</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/products/${product.id}/edit`}>
                            تعديل
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-500 focus:text-red-500"
                          onClick={() =>
                            setDeleteDialog({
                              open: true,
                              id: product.id,
                              name: product.name,
                            })
                          }
                        >
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open: boolean) => setDeleteDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف المنتج <strong>&quot;{deleteDialog.name}&quot;</strong>؟ هذا الإجراء لا يمكن
              التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, id: '', name: '' })}
            >
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onDelete(deleteDialog.id);
                setDeleteDialog({ open: false, id: '', name: '' });
              }}
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}