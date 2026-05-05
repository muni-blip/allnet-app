import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || '';
    if (!slug) return new Response('Missing slug', { status: 400 });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_org_public_page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_org_slug: slug }),
    });
    const data = await res.json();
    if (data?.error) return new Response('Not found', { status: 404 });

    const { org, member_count, session_count } = data;
    const name = (org.name || 'GROUP').toUpperCase();
    const stats = `${member_count} MEMBERS  ·  ${session_count} SESSIONS`;
    const location = org.location || '';
    const gradientUrl = 'https://orrpowyewsioyxztwkdq.supabase.co/storage/v1/object/public/assets/gradient-bar-min.png';

    return new ImageResponse(
      h('div', {
        style: { width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', backgroundColor: '#000', color: '#fff', fontFamily: 'sans-serif', position: 'relative' },
      },
        h('img', { src: gradientUrl, style: { width: '1200px', height: '6px', objectFit: 'cover' } }),
        h('div', {
          style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '40px' },
        },
          org.logo_url && !org.logo_url.startsWith('/')
            ? h('img', { src: org.logo_url, style: { width: '120px', height: '120px', borderRadius: '60px', objectFit: 'cover', border: '3px solid #222' } })
            : h('div', { style: { width: '120px', height: '120px', borderRadius: '60px', backgroundColor: '#F74501', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '52px', fontWeight: 700, border: '3px solid #222' } }, org.name?.[0] || '?'),
          h('div', { style: { fontSize: '48px', fontWeight: 700, letterSpacing: '2px', textAlign: 'center' } }, name),
          h('div', { style: { fontSize: '20px', color: '#999', letterSpacing: '2px', fontWeight: 600 } }, stats),
          location ? h('div', { style: { fontSize: '18px', color: '#666' } }, location) : null,
        ),
        h('div', { style: { position: 'absolute', bottom: '24px', right: '32px', fontSize: '16px', fontWeight: 700, color: '#333', letterSpacing: '2px' } }, 'ALLNET'),
      ),
      { width: 1200, height: 630 },
    );
  } catch (e) {
    console.error('OG error:', e);
    return new Response('Error', { status: 500 });
  }
}
