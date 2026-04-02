import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  const slug = req.query.slug || '';

  if (!slug) {
    // Redirect to landing if no slug
    return res.redirect(302, '/allnet-landing.html');
  }

  // Fetch basic profile for OG tags
  let profile = null;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: byUser } = await sb.from('profiles')
      .select('first_name,last_name,name,skill_rating,social_rating,wins,losses,draws,is_founding_hooper,founding_number')
      .eq('username', slug.toLowerCase())
      .maybeSingle();

    if (byUser) {
      profile = byUser;
    } else {
      const { data: byCode } = await sb.from('profiles')
        .select('first_name,last_name,name,skill_rating,social_rating,wins,losses,draws,is_founding_hooper,founding_number')
        .eq('short_code', slug.toUpperCase())
        .maybeSingle();
      profile = byCode;
    }
  } catch (e) {
    console.error('Profile fetch error:', e);
  }

  // Build OG meta values
  const displayName = profile
    ? ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim() || profile.name
    : 'Player';

  const skill = profile?.skill_rating ? Number(profile.skill_rating).toFixed(1) : null;
  const social = profile?.social_rating ? Number(profile.social_rating).toFixed(1) : null;
  const record = profile ? `${profile.wins || 0}W - ${profile.losses || 0}L - ${profile.draws || 0}D` : '';

  const ogTitle = `${displayName} on AllNet`;
  const ogDesc = profile
    ? `${record}${skill ? ' · Skill: ' + skill : ''}${social ? ' · Social: ' + social : ''} — Check out their basketball career card.`
    : 'Check out this player on AllNet — the pickup basketball reputation network.';

  const ogImage = `https://allnetgames.com/api/og?slug=${encodeURIComponent(slug)}`;
  const ogUrl = `https://allnetgames.com/p/${encodeURIComponent(slug)}`;

  // Read the static player page HTML
  let html;
  try {
    html = readFileSync(join(process.cwd(), 'allnet-player.html'), 'utf-8');
  } catch (e) {
    console.error('Could not read allnet-player.html:', e);
    return res.status(500).send('Server error');
  }

  // Replace static OG tags with dynamic ones
  html = html.replace(
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${escapeHtml(ogTitle)}">`
  );
  html = html.replace(
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${escapeHtml(ogDesc)}">`
  );
  html = html.replace(
    /<meta property="og:image"[^>]*>/,
    `<meta property="og:image" content="${ogImage}">`
  );
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>AllNet — ${escapeHtml(displayName)}</title>`
  );

  // Add og:url and twitter meta
  const extraMeta = `
    <meta property="og:url" content="${ogUrl}">
    <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
    <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
    <meta name="twitter:image" content="${ogImage}">
  `;
  html = html.replace('</head>', extraMeta + '</head>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
