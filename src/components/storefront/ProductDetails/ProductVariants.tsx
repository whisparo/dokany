'use client';

// 💡 مصفوفات البيانات الثابتة للمتغيرات
export const MOCK_COLORS = [
  { id: 'black', name: 'أسود', hex: '#000000' },
  { id: 'navy', name: 'كحلي', hex: '#1E3A8A' },
  { id: 'gray', name: 'رمادي', hex: '#6B7280' },
];

export const MOCK_SIZES = [
  { id: '38', value: '38 EU', disabled: false },
  { id: '39', value: '39 EU', disabled: false },
  { id: '40', value: '40 EU', disabled: false },
  { id: '41', value: '41 EU', disabled: true },
  { id: '42', value: '42 EU', disabled: false },
];

interface ProductVariantsProps {
  theme: any;
  selectedColor: string;
  setSelectedColor: (id: string) => void;
  selectedSize: string;
  setSelectedSize: (id: string) => void;
}

export function ProductVariants({
  theme,
  selectedColor,
  setSelectedColor,
  selectedSize,
  setSelectedSize,
}: ProductVariantsProps) {
  return (
    <div className={theme.variantsSection}>
      {/* 1. اختيار الألوان */}
      <div className="space-y-3">
        <span className={theme.colorOptionLabel}>
          اللون المحدد: <strong className="text-slate-800 dark:text-white">{MOCK_COLORS.find(c => c.id === selectedColor)?.name}</strong>
        </span>
        <div className={theme.colorGrid}>
          {MOCK_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              onClick={() => setSelectedColor(color.id)}
              className={theme.colorCircle(selectedColor === color.id, color.hex)}
              style={{ backgroundColor: color.hex }}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* 2. اختيار المقاسات */}
      <div className="space-y-3">
        <span className={theme.sizeOptionLabel}>
          المقاس المختار: <strong className="text-slate-800 dark:text-white">{MOCK_SIZES.find(s => s.id === selectedSize)?.value}</strong>
        </span>
        <div className={theme.sizeGrid}>
          {MOCK_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              onClick={() => !size.disabled && setSelectedSize(size.id)}
              disabled={size.disabled}
              className={theme.sizeChip(selectedSize === size.id, size.disabled)}
            >
              {size.value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}