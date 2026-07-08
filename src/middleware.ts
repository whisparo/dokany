// src/middleware.ts

import { proxy } from './proxy';

// 1. إجبار الكلاود فلير والـ Next على تشغيل البروكسي في بيئة الـ Edge
export const runtime = 'edge';

// 2. تصدير دالة البروكسي كـ Default Export ليقرأها الـ Next كميدل وير رسمي
export default proxy;

// 3. تصدير الـ matcher اللي إنت مهندزه في ملف البروكسي
export { config } from './proxy';