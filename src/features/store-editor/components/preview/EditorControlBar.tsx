//src/features/store-editor/components/preview/EditorControlBar.tsx

'use client';

import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { EditorControlBarProps } from '../../types/editor.types';
import Button from '@/components/shared/Button';

export const EditorControlBar: React.FC<EditorControlBarProps> = ({
  isEditing,
  onToggleEdit,
}) => {
  const { isEditMode, toggleEditMode } = useEditorStore();

  const currentEditState = isEditing ?? isEditMode;

  const handleToggle = () => {
    toggleEditMode();
    if (onToggleEdit) {
      onToggleEdit(!currentEditState);
    }
  };

  return (
    <aside
      dir="rtl"
      aria-label="شريط التحكم في وضع التحرير"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-slate-900/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-2xl border border-slate-700/50 transition-all duration-300"
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            currentEditState ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
          }`}
        />
        <span className="text-xs font-medium tracking-wide">
          {currentEditState ? 'وضع التحرير المباشر' : 'معاينة المتجر'}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      <Button
        type="button"
        variant={currentEditState ? 'danger' : 'primary'}
        size="sm"
        onClick={handleToggle}
        className="rounded-full text-xs font-semibold px-4 py-1"
      >
        {currentEditState ? 'إغلاق التحرير' : 'تفعيل التحرير'}
      </Button>
    </aside>
  );
};

export default EditorControlBar;