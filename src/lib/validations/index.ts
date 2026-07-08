// src/lib/validations/index.ts
/**
 * نقطة التصدير المركزية لجميع مخططات التحقق (Zod Schemas).
 *
 * هذا الملف هو الوحيد الذي يجب استيراده في باقي أجزاء التطبيق.
 * مثال: import { createProductSchema } from '@/lib/validations';
 */

// ╔════════════════════════════════════════════════════════════╗
// ║  🛡️ أدوات التحقق العامة                                    ║
// ╚════════════════════════════════════════════════════════════╝
export { BrandoValidationError, validateOrThrow } from './helpers';

// ╔════════════════════════════════════════════════════════════╗
// ║  👤 المصادقة                                               ║
// ╚════════════════════════════════════════════════════════════╝
export {
  registerMerchantSchema,
  loginSchema,
  updateProfileSchema,
} from './auth';
export type {
  RegisterMerchantInput,
  LoginInput,
  UpdateProfileInput,
} from './auth';

// ╔════════════════════════════════════════════════════════════╗
// ║  📦 المنتجات                                               ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createProductSchema,
  updateProductSchema,
} from './product';
export type {
  CreateProductInput,
  UpdateProductInput,
} from './product';

// ╔════════════════════════════════════════════════════════════╗
// ║  📂 التصنيفات                                              ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createCategorySchema,
  updateCategorySchema,
} from './category';
export type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './category';

// ╔════════════════════════════════════════════════════════════╗
// ║  🏪 المتاجر                                                ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createStoreSchema,
  updateStoreSchema,
} from './store';
export type {
  CreateStoreInput,
  UpdateStoreInput,
} from './store';

// ╔════════════════════════════════════════════════════════════╗
// ║  🛒 السلة                                                  ║
// ╚════════════════════════════════════════════════════════════╝
export {
  addToCartSchema,
  updateCartQuantitySchema,
  removeFromCartSchema,
  clearCartSchema,
} from './cart';
export type {
  AddToCartInput,
  UpdateCartQuantityInput,
  RemoveFromCartInput,
  ClearCartInput,
} from './cart';

// ╔════════════════════════════════════════════════════════════╗
// ║  📋 الطلبات                                                ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createOrderSchema,
  updateOrderSchema,
} from './order';
export type {
  CreateOrderInput,
  UpdateOrderInput,
} from './order';

// ╔════════════════════════════════════════════════════════════╗
// ║  💳 المدفوعات                                              ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createPaymentSchema,
  updatePaymentSchema,
} from './payment';
export type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from './payment';

// ╔════════════════════════════════════════════════════════════╗
// ║  🚚 الشحنات                                                ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createShipmentSchema,
  updateShipmentSchema,
} from './shipment';
export type {
  CreateShipmentInput,
  UpdateShipmentInput,
} from './shipment';

// ╔════════════════════════════════════════════════════════════╗
// ║  🎟️ الكوبونات                                              ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} from './coupon';
export type {
  CreateCouponInput,
  UpdateCouponInput,
  ValidateCouponInput,
} from './coupon';

// ╔════════════════════════════════════════════════════════════╗
// ║  💬 الفصال الذكي                                           ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createHaggleSchema,
  updateHaggleSchema,
} from './haggle';
export type {
  CreateHaggleInput,
  UpdateHaggleInput,
} from './haggle';

// ╔════════════════════════════════════════════════════════════╗
// ║  👥 الشراء الجماعي                                         ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createGroupBuySchema,
  updateGroupBuySchema,
} from './group-buy';
export type {
  CreateGroupBuyInput,
  UpdateGroupBuyInput,
} from './group-buy';

// ╔════════════════════════════════════════════════════════════╗
// ║  📱 رسائل تيليجرام                                         ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createTelegramMessageSchema,
  updateTelegramMessageSchema,
} from './telegram';
export type {
  CreateTelegramMessageInput,
  UpdateTelegramMessageInput,
} from './telegram';

// ╔════════════════════════════════════════════════════════════╗
// ║  🖼️ الوسائط                                                ║
// ╚════════════════════════════════════════════════════════════╝
export {
  imageUploadSchema,
  videoUploadSchema,
  bulkImageUploadSchema,
  deleteMediaSchema,
} from './media';
export type {
  ImageUploadInput,
  VideoUploadInput,
  BulkImageUploadInput,
  DeleteMediaInput,
} from './media';

// ╔════════════════════════════════════════════════════════════╗
// ║  ⚙️ إعدادات المنصة                                         ║
// ╚════════════════════════════════════════════════════════════╝
export {
  createPlatformSettingSchema,
  updatePlatformSettingSchema,
  getPlatformSettingSchema,
  queryPlatformSettingsSchema,
} from './platform';
export type {
  CreatePlatformSettingInput,
  UpdatePlatformSettingInput,
  GetPlatformSettingInput,
  QueryPlatformSettingsInput,
} from './platform';