//src/features/store-editor/types/editor.types.ts

export interface EditorControlBarProps {
  storeId?: string;
  storeSlug?: string;
  isEditing?: boolean;
  onToggleEdit?: (editing: boolean) => void;
}