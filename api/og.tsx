import { ImageResponse } from '@vercel/og';
import { createClient } from '@supabase/supabase-js';

// Node.js serverless function (not Edge — @supabase/supabase-js needs Node APIs)

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  try {
    const slug = req.query.slug || '';

    if (!slug) {
      return res.status(400).send('Missing slug');
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Lookup by username first, then short_code
    let profile = null;
    const { data: byUser } = await sb.from('profiles')
      .select('first_name,last_name,name,wins,losses,draws,skill_rating,social_rating,is_founding_hooper,founding_number,total_checkins,avatar_cutout_url,selected_cover')
      .eq('username', slug.toLowerCase())
      .maybeSingle();

    if (byUser) {
      profile = byUser;
    } else {
      const { data: byCode } = await sb.from('profiles')
        .select('first_name,last_name,name,wins,losses,draws,skill_rating,social_rating,is_founding_hooper,founding_number,total_checkins,avatar_cutout_url,selected_cover')
        .eq('short_code', slug.toUpperCase())
        .maybeSingle();
      profile = byCode;
    }

    if (!profile) {
      return new Response('Player not found', { status: 404 });
    }

    const firstName = (profile.first_name || profile.name?.split(' ')[0] || 'PLAYER').toUpperCase();
    const lastName = (profile.last_name || profile.name?.split(' ').slice(1).join(' ') || '').toUpperCase();
    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const draws = profile.draws || 0;
    const skill = profile.skill_rating ? Number(profile.skill_rating).toFixed(1) : '—';
    const social = profile.social_rating ? Number(profile.social_rating).toFixed(1) : '—';
    const isFH = profile.is_founding_hooper;
    const fhNum = profile.founding_number;

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)',
            fontFamily: 'sans-serif',
            position: 'relative',
          }}
        >
          {/* Subtle glow */}
          <div style={{
            position: 'absolute',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(247,69,1,0.08) 0%, transparent 70%)',
            top: '115px',
            left: '400px',
            display: 'flex',
          }} />

          {/* ALLNET logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            position: 'absolute',
            top: '32px',
            left: '48px',
          }}>
            <span style={{ color: '#fff', fontSize: '28px', fontWeight: 800, letterSpacing: '2px' }}>ALLNET</span>
          </div>

          {/* Main card area */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '60px',
          }}>
            {/* Left side: Name + Badge */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}>
              {isFH && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(247,69,1,0.12)',
                  border: '1px solid rgba(247,69,1,0.3)',
                  borderRadius: '100px',
                  padding: '6px 16px',
                  marginBottom: '16px',
                }}>
                  <span style={{ fontSize: '14px' }}>🏅</span>
                  <span style={{ color: '#F74501', fontSize: '14px', fontWeight: 700 }}>
                    FOUNDING HOOPER #{fhNum}
                  </span>
                </div>
              )}

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0px',
              }}>
                <span style={{ color: '#fff', fontSize: '56px', fontWeight: 900, lineHeight: 1 }}>
                  {firstName}
                </span>
                {lastName && (
                  <span style={{ color: '#fff', fontSize: '56px', fontWeight: 900, lineHeight: 1 }}>
                    {lastName}
                  </span>
                )}
              </div>

              {/* Gradient bar */}
              <div style={{
                width: '200px',
                height: '8px',
                background: 'linear-gradient(90deg, #F74501, #0040FF)',
                borderRadius: '4px',
                marginTop: '16px',
                display: 'flex',
              }} />
            </div>

            {/* Right side: Stats */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '28px 36px',
            }}>
              {/* W/L/D */}
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

              {/* Divider */}
              <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', display: 'flex' }} />

              {/* Ratings */}
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

          {/* Bottom URL */}
          <div style={{
            position: 'absolute',
            bottom: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ color: '#555', fontSize: '16px', fontWeight: 500 }}>
              allnetgames.com
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('OG image error:', e);
    return res.status(500).send('Error generating image');
  }
}
