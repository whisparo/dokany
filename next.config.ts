/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 🌟 بنفتح تصريح رسمي لكل السيرفرات الشهيرة اللي ممكن تسحب منها صور منتجات أو هيرو
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**', 
        port: '',
        pathname: '**', // 👈 إضافة الـ pathname مهمة جداً عشان النكست يفهم السيلد كارد (**) بالكامل
      },
    ],
  },
};

module.exports = nextConfig;