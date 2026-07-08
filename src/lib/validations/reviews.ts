// src/lib/validations/reviews.ts
import { z } from "zod";

export const reviewSchema = z.object({
  userName: z.string().min(2, "الاسم لازم يكون حرفين على الأقل").max(50),
  rating: z.number().int().min(1).max(5, "التقييم لازم يكون بين 1 و 5"),
  comment: z.string().min(10, "التعليق لازم يكون 10 حروف على الأقل").max(500),
  productId: z.string().uuid("معرف المنتج غير صالح"),
});

// ده النوع اللي هتستخدمه في الـ Frontend والـ Backend عشان يبقى عندك Type Safety كاملة
export type ReviewInput = z.infer<typeof reviewSchema>;