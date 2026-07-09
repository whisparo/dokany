// src/app/page.tsx

export const runtime = 'edge'; // تشغيل الصفحة على الحافة فوراً

export default function HomePage() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      color: '#ffffff',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        backgroundColor: '#141414',
        border: '1px solid #262626',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '500px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚀</div>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '10px', color: '#3b82f6' }}>
          Dokany Engine
        </h1>
        <p style={{ color: '#a3a3a3', fontSize: '15px', lineHeight: '1.6', marginBottom: '25px' }}>
          البنية التحتية للمشروع تعمل الآن بنجاح على الـ <span style={{ color: '#10b981', fontWeight: '600' }}>Cloudflare Edge Runtime</span>. جميع البوابات والمحركات مأمنة وجاهزة.
        </p>
        
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px',
          textAlign: 'left',
          backgroundColor: '#050505',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '13px',
          fontFamily: 'monospace',
          color: '#cbd5e1',
          border: '1px solid #1f1f1f'
        }}>
          <div>🟢 Core Infrastructure: Active</div>
          <div>🟢 Edge Routing: 100% OK</div>
          <div>🔒 Auth Gateway: Armed</div>
        </div>

        <p style={{ marginTop: '20px', fontSize: '12px', color: '#525252' }}>
          Dokany Repository • Production Environment
        </p>
      </div>
    </div>
  );
}