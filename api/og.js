import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

async function fetchProfile(slug) {
  const cols = 'first_name,last_name,name,wins,losses,draws,skill_rating,social_rating,is_founding_hooper,founding_number';
  let res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(slug.toLowerCase())}&select=${cols}&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  let data = await res.json();
  if (data?.length > 0) return data[0];
  res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?short_code=eq.${encodeURIComponent(slug.toUpperCase())}&select=${cols}&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  data = await res.json();
  return data?.length > 0 ? data[0] : null;
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
    const wins = String(profile.wins || 0);
    const losses = String(profile.losses || 0);
    const draws = String(profile.draws || 0);
    const skill = profile.skill_rating ? Number(profile.skill_rating).toFixed(1) : '—';
    const social = profile.social_rating ? Number(profile.social_rating).toFixed(1) : '—';
    const isFH = profile.is_founding_hooper;
    const fhNum = profile.founding_number;

    // Build card-style OG image matching the compact social export design
    const nameRow1 = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%' } },
      h('span', { style: { color: '#fff', fontSize: '64px', fontWeight: 900, lineHeight: 1, flexShrink: 0 } }, firstName),
      h('div', { style: { display: 'flex', flex: 1, height: '28px', background: 'linear-gradient(90deg, #F74501, #0040FF)', borderRadius: '4px' } })
    );

    const nameRow2 = lastName ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%' } },
      h('div', { style: { display: 'flex', flex: 1, height: '28px', background: 'linear-gradient(90deg, #F74501, #0040FF)', borderRadius: '4px' } }),
      h('span', { style: { color: '#fff', fontSize: '64px', fontWeight: 900, lineHeight: 1, flexShrink: 0 } }, lastName)
    ) : null;

    const wldSection = h('div', { style: { display: 'flex', justifyContent: 'center', gap: '80px', width: '100%', marginTop: '32px' } },
      ...[['W', wins], ['L', losses], ['D', draws]].map(([label, val]) =>
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
          h('span', { style: { color: '#fff', fontSize: '48px', fontWeight: 900 } }, label),
          h('span', { style: { color: '#fff', fontSize: '56px', fontWeight: 900 } }, val)
        )
      )
    );

    const ratingsSection = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '28px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' } },
        h('span', { style: { color: '#fff', fontSize: '24px', fontWeight: 600 } }, 'SKILL RATING'),
        h('span', { style: { color: '#F74501', fontSize: '28px', fontWeight: 900 } }, skill)
      ),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' } },
        h('span', { style: { color: '#fff', fontSize: '24px', fontWeight: 600 } }, 'SOCIAL RATING'),
        h('span', { style: { color: '#FACC15', fontSize: '28px', fontWeight: 900 } }, social)
      )
    );

    // Card with gradient border
    const card = h('div', { style: { display: 'flex', padding: '3px', borderRadius: '24px', background: 'linear-gradient(180deg, #F74501 0%, #0040FF 100%)' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: '#000', borderRadius: '21px', padding: '28px 36px 32px', width: '560px' } },
        ...[nameRow1, nameRow2].filter(Boolean),
        wldSection,
        ratingsSection
      )
    );

    const element = h('div', {
      style: { width: '1200px', height: '630px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', fontFamily: 'sans-serif', position: 'relative' }
    },
      card,
      h('div', { style: { display: 'flex', position: 'absolute', top: '24px', left: '36px' } },
        h('span', { style: { color: '#fff', fontSize: '28px', fontWeight: 800 } }, 'ALLNET')
      ),
      h('div', { style: { display: 'flex', position: 'absolute', bottom: '20px', right: '36px' } },
        h('span', { style: { color: '#555', fontSize: '16px', fontWeight: 500 } }, 'allnetgames.com')
      )
    );

    return new ImageResponse(element, {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' },
    });
  } catch (e) {
    console.error('OG image error:', e);
    return new Response('Error: ' + e.message, { status: 500 });
  }
}
