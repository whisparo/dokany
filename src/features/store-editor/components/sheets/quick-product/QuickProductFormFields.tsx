//src/features/store-editor/components/sheets/quick-product/QuickProductFormFields.tsx

'use client';

import { Input } from '@/components/shared/Input/Input';

interface QuickProductFormFieldsProps {
  productName: string;
  setProductName: (val: string) => void;
  priceCents: string;
  setPriceCents: (val: string) => void;
  disabled?: boolean;
}

export function QuickProductFormFields({
  productName,
  setProductName,
  priceCents,
  setPriceCents,
  disabled = false,
}: QuickProductFormFieldsProps) {
  return (
    <>
      <div>
        <label htmlFor="productName" className="block text-sm font-medium mb-1.5">
          اسم المنتج *
        </label>
        <Input
          id="productName"
          name="name"
          type="text"
          placeholder="أدخل اسم المنتج"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          required
          disabled={disabled}
          className="w-full"
          dir="rtl"
        />
      </div>

      <div>
        <label htmlFor="price" className="block text-sm font-medium mb-1.5">
          السعر (بالجنيه) *
        </label>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="مثال: 99.99"
          value={priceCents}
          onChange={(e) => setPriceCents(e.target.value)}
          required
          disabled={disabled}
          className="w-full"
          dir="rtl"
        />
      </div>
    </>
  );
}