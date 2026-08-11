// src/features/store-editor/components/sheets/QuickProductSheet.tsx

'use client';

import { useState, useActionState, useEffect, useTransition } from 'react';
import { createQuickProduct } from '../../server/editorActions';
import Button from '@/components/shared/Button';
import { Typography } from '@/components/shared/Typography';
import { X, Loader2, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateId } from '@/lib/utils/id';

import { QuickProductImageUploader } from './quick-product/QuickProductImageUploader';
import { QuickProductVideoUploader } from './quick-product/QuickProductVideoUploader';
import { QuickProductFormFields } from './quick-product/QuickProductFormFields';

interface QuickProductSheetProps {
  storeId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function QuickProductSheet({ storeId, isOpen, onClose }: QuickProductSheetProps) {
  const [isTransitionPending, startTransition] = useTransition();

  const [productName, setProductName] = useState('');
  const [priceCents, setPriceCents] = useState('');
  const [tempUrl, setTempUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [actionState, formAction] = useActionState(
    createQuickProduct,
    { error: null, success: false, productId: null, mediaId: null }
  );

  // مسح البيانات عند الإغلاق
  useEffect(() => {
    if (!isOpen) {
      setProductName('');
      setPriceCents('');
      setTempUrl(null);
      setVideoUrl(null);
      setUploadError(null);
    }
  }, [isOpen]);

  // إغلاق تلقائي عند النجاح
  useEffect(() => {
    if (actionState?.success) {
      const timer = setTimeout(() => {
        setProductName('');
        setPriceCents('');
        setTempUrl(null);
        setVideoUrl(null);
        setUploadError(null);
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [actionState?.success, onClose]);

  const handleSubmit = async (formData: FormData) => {
    formData.append('storeId', storeId);

    const idempotencyKey = `product_${storeId}_${Date.now()}_${generateId()}`;
    formData.append('idempotencyKey', idempotencyKey);

    const priceInCents = Math.round(parseFloat(priceCents) * 100);
    formData.append('priceCents', String(priceInCents));

    if (tempUrl) {
      formData.append('tempUrl', tempUrl);
    }
    if (videoUrl) {
      formData.append('videoUrl', videoUrl);
    }

    startTransition(() => {
      formAction(formData);
    });
  };

  if (!isOpen) return null;

  const isSuccess = actionState?.success === true;
  const isPending = isTransitionPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl pointer-events-auto transition-transform duration-300 ease-out",
          "animate-in slide-in-from-bottom-10 duration-300"
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-60px)]">
          <div className="flex items-center justify-between mb-4">
            <Typography variant="h3" className="text-xl font-bold">
              إضافة منتج جديد
            </Typography>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {(actionState?.error || uploadError) && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <Typography variant="body-sm" className="text-red-600 dark:text-red-400">
                {actionState?.error || uploadError}
              </Typography>
            </div>
          )}

          {isSuccess && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <Typography variant="body-sm" className="text-green-600 dark:text-green-400">
                تم إضافة المنتج بنجاح! جاري التحديث...
              </Typography>
            </div>
          )}

          <form action={handleSubmit} className="space-y-5">
            <QuickProductFormFields
              productName={productName}
              setProductName={setProductName}
              priceCents={priceCents}
              setPriceCents={setPriceCents}
              disabled={isPending || isSuccess}
            />

            <QuickProductImageUploader
              tempUrl={tempUrl}
              onImageChange={setTempUrl}
              onError={setUploadError}
              disabled={isPending || isSuccess}
            />

            <QuickProductVideoUploader
              videoUrl={videoUrl}
              onVideoChange={setVideoUrl}
              onError={setUploadError}
              disabled={isPending || isSuccess}
            />

            <div className="flex gap-3 pt-3">
              <Button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2"
                disabled={
                  isPending ||
                  isSuccess ||
                  !productName.trim() ||
                  !priceCents ||
                  !tempUrl
                }
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الإضافة...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    إضافة المنتج
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                إلغاء
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}