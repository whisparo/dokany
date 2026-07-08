// src/lib/telegram/main-bot.ts
/**
 * ============================================================================
 * 🤖 Central Telegram Bot Service - نظام دكاني
 * ============================================================================
 * المسؤول عن: إرسال الإشعارات، إدارة الأزرار التفاعلية، والتواصل اللحظي.
 * يضم حماية صارمة للأنواع وهياكل الرسائل.
 */

const MAIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ERROR_BOT_TOKEN = process.env.ERROR_BOT_TOKEN!;
const ERROR_CHANNEL_ID = process.env.ERROR_CHANNEL_ID!;

// تعريف واجهات الأنواع لمنع الـ any تماماً في هياكل الأزرار
export interface TelegramButton {
  text: string;
  url?: string;
  type?: 'web_app' | 'contact' | 'callback';
  value?: string;
  callback_data?: string;
}

export interface TelegramPayload {
  chat_id: string;
  text: string;
  parse_mode: 'Markdown' | 'HTML';
  reply_markup?: any;
}

/**
 * إرسال رسالة نصية تفاعلية عبر بوت المنصة الرئيسي
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  buttons?: TelegramButton[] | TelegramButton[][],
  persistentButtons?: TelegramButton[][]
): Promise<boolean> {
  try {
    const payload: TelegramPayload = {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    };

    // بناء الـ Reply Markup المخصص للأزرار إذا وجدت
    if (buttons || persistentButtons) {
      payload.reply_markup = buildReplyMarkup(buttons, persistentButtons);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${MAIN_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('❌ [Main Bot Service] Send error:', error);
    return false;
  }
}

/**
 * بناء وتشكيل كائنات أزرار تليجرام (Reply Markup) بدقة هندسية
 */
function buildReplyMarkup(buttons?: TelegramButton[] | TelegramButton[][], persistentButtons?: TelegramButton[][]) {
  // 1. معالجة الأزرار الثابتة (Persistent Bottom Keyboard Menu)
  if (persistentButtons && Array.isArray(persistentButtons) && persistentButtons.length > 0) {
    return {
      keyboard: persistentButtons.map((row) =>
        row.map((btn) => ({ text: btn.text }))
      ),
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  if (!buttons || (Array.isArray(buttons) && buttons.length === 0)) {
    return { remove_keyboard: true };
  }

  // 2. معالجة المصفوفات ثنائية الأبعاد (2D Array Rows)
  if (Array.isArray(buttons) && buttons.length > 0 && Array.isArray(buttons[0])) {
    const rows = buttons as TelegramButton[][];
    return {
      inline_keyboard: rows.map((row) =>
        row.map((btn) => {
          // 🎯 تصحيح: التحقق من الـ web_app أولاً قبل الـ url القياسي لمنع تداخل الشروط
          if (btn.type === 'web_app' && btn.url) {
            return { text: btn.text, web_app: { url: btn.url } };
          }
          if (btn.url) {
            return { text: btn.text, url: btn.url };
          }
          return { text: btn.text, callback_data: btn.value || btn.callback_data || 'void' };
        })
      ),
    };
  }

  // 3. معالجة المصفوفات المسطحة أحادية الأبعاد (1D Flat Array)
  const flatButtons = buttons as TelegramButton[];
  const hasContact = flatButtons.some((b) => b.type === 'contact');

  // 🎯 تصحيح: أزرار طلب الاتصال (Contact) تجبرنا على استخدام الـ Normal Keyboard وليس الـ Inline
  if (hasContact) {
    return {
      keyboard: [
        flatButtons.map((b) => ({
          text: b.text,
          request_contact: b.type === 'contact' ? true : undefined,
        })),
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  }

  return {
    inline_keyboard: [
      flatButtons.map((b) => {
        // 🎯 تصحيح: التحقق من الـ web_app أولاً هنا أيضاً
        if (b.type === 'web_app' && b.url) {
          return { text: b.text, web_app: { url: b.url } };
        }
        if (b.url) {
          return { text: b.text, url: b.url };
        }
        return { text: b.text, callback_data: b.value || b.callback_data || 'void' };
      }),
    ],
  };
}

/**
 * إرسال إشعار فوري للأخطاء البرمجية إلى قناة الإشراف الفني والأدمنز
 */
export async function sendErrorNotification(text: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${ERROR_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ERROR_CHANNEL_ID,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('❌ [Error Bot Service] Critical failure sending log:', error);
    return false;
  }
}

/**
 * إرسال إشعار منسق ومفصل للتاجر عند استقبال طلب جديد في متجره
 */
export async function notifyVendorNewOrder(
  vendorChatId: string,
  orderData: {
    orderId: string;
    customerName: string;
    total: number;
    items: Array<{ name: string; quantity: number; price: number }>;
  }
): Promise<boolean> {
  const message = `📦 **طلب جديد!**\n─────────────────\n🆔 **رقم الطلب:** \`${orderData.orderId}\`\n👤 **العميل:** ${orderData.customerName}\n💰 **الإجمالي:** ${orderData.total} ج.م\n\n**المنتجات:**\n${orderData.items.map(item => `• ${item.name} × ${item.quantity} = ${item.price * item.quantity} ج.م`).join('\n')}\n─────────────────\n📱 **توجه إلى لوحة التحكم لإدارة الطلب.**`;

  return sendTelegramMessage(vendorChatId, message);
}

/**
 * إرسال إشعار فوري للعميل عند تحديث حالة الشحن أو المعالجة لطلبه
 */
export async function notifyCustomerOrderUpdate(
  customerChatId: string,
  orderId: string,
  status: string,
  vendorName: string
): Promise<boolean> {
  const statusMap: Record<string, string> = {
    processing: '🔵 جاري التجهيز',
    shipped: '🚚 تم الشحن',
    delivered: '✅ تم التوصيل',
    cancelled: '❌ تم الإلغاء',
  };

  const message = `📋 **تحديث حالة الطلب**\n─────────────────\n🆔 **رقم الطلب:** \`${orderId}\`\n🏪 **المتجر:** ${vendorName}\n📌 **الحالة:** ${statusMap[status] || status}\n─────────────────\n📱 **تابع طلباتك من لوحة التحكم.**`;

  return sendTelegramMessage(customerChatId, message);
}