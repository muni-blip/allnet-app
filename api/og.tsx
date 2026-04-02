import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

async function fetchProfile(slug) {
  const cols = 'first_name,last_name,name,wins,losses,draws,skill_rating,social_rating,is_founding_hooper,founding_number';
  let res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(slug.toLowerCase())}&select=${cols}&limit=1`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  let data = await res.json();
  if (data && data.length > 0) return data[0];
  res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?short_code=eq.${encodeURIComponent(slug.toUpperCase())}&select=${cols}&limit=1`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  data = await res.json();
  return data && data.length > 0 ? data[0] : null;
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || '';
    if (!slug) return new Response('Missing slug', { status: 400 });

    const profile = await fetchProfile(slug);
    if (!profile) return new Response('Player not found', { status: 404 });

    const firstName = (profile.first_name || profile.name?.split(' ')[0] || 'PLAYER').toUpperCase();
    const lastName = (profile.last_name || profile.name?.split(' ').slice(1).join(' ') || '').toUpperCase();
    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const draws = profile.draws || 0;
    const skill = profile.skill_rating ? Number(profile.skill_rating).toFixed(1) : '—';
    const social = profile.social_rating ? Number(profile.social_rating).toFixed(1) : '—';
    const isFH = profile.is_founding_hooper;
    const fhNum = profile.founding_number;

    return new ImageResponse(
      (
        <div style={{ width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)', fontFamily: 'sans-serif', position: 'relative' }}>
          <div style={{ display: 'flex', position: 'absolute', top: '32px', left: '48px' }}>
            <span style={{ color: '#fff', fontSize: '28px', fontWeight: 800 }}>ALLNET</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '60px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              {isFH && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(247,69,1,0.12)', border: '1px solid rgba(247,69,1,0.3)', borderRadius: '100px', padding: '6px 16px', marginBottom: '16px' }}>
                  <span style={{ color: '#F74501', fontSize: '14px', fontWeight: 700 }}>FOUNDING HOOPER #{fhNum}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#fff', fontSize: '56px', fontWeight: 900, lineHeight: 1 }}>{firstName}</span>
                {lastName && <span style={{ color: '#fff', fontSize: '56px', fontWeight: 900, lineHeight: 1 }}>{lastName}</span>}
              </div>
              <div style={{ display: 'flex', width: '200px', height: '8px', background: 'linear-gradient(90deg, #F74501, #0040FF)', borderRadius: '4px', marginTop: '16px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '28px 36px' }}>
              <div style={{ display: 'flex', gap: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ color: '#888', fontSize: '14px', fontWeight: 700 }}>W</span>
                  <span style={{ color: '#fff', fontSize: '36px', fontWeight: 900 }}>{wins}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ color: '#888', fontSize: '14px', fontWeight: 700 }}>L</span>
                  <span style={{ color: '#fff', fontSize: '36px', fontWeight: 900 }}>{losses}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ color: '#888', fontSize: '14px', fontWeight: 700 }}>D</span>
                  <span style={{ color: '#fff', fontSize: '36px', fontWeight: 900 }}>{draws}</span>
                </div>
              </div>
              <div style={{ display: 'flex', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '40px' }}>
                  <span style={{ color: '#aaa', fontSize: '16px', fontWeight: 600 }}>SKILL RATING</span>
                  <span style={{ color: '#F74501', fontSize: '24px', fontWeight: 900 }}>{skill}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '40px' }}>
                  <span style={{ color: '#aaa', fontSize: '16px', fontWeight: 600 }}>SOCIAL RATING</span>
                  <span style={{ color: '#FACC15', fontSize: '24px', fontWeight: 900 }}>{social}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', position: 'absolute', bottom: '28px' }}>
            <span style={{ color: '#555', fontSize: '16px', fontWeight: 500 }}>allnetgames.com</span>
          </div>
        </div>
      ),
      { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } }
    );
  } catch (e) {
    console.error('OG image error:', e);
    return new Response('Error: ' + e.message, { status: 500 });
  }
}
