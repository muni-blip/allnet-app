import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  const slug = req.query.slug || '';
  if (!slug) return res.redirect(302, '/');

  let org = null;
  let memberCount = 0;
  let sessionCount = 0;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.rpc('get_org_public_page', { p_org_slug: slug });
    if (data && !data.error) {
      org = data.org;
      memberCount = data.member_count || 0;
      sessionCount = data.session_count || 0;
    }
  } catch (e) {
    console.error('Org fetch error:', e);
  }

  const displayName = org ? org.name : 'Group';
  const ogTitle = `${displayName} on AllNet`;
  const ogDesc = org
    ? `${org.description || displayName} — ${memberCount} members · ${sessionCount} sessions hosted.`
    : 'Check out this group on AllNet — the pickup basketball reputation network.';
  const ogImage = `https://allnetgames.com/api/org-og?slug=${encodeURIComponent(slug)}`;
  const ogUrl = `https://allnetgames.com/org/${encodeURIComponent(slug)}`;

  let html;
  try {
    html = readFileSync(join(process.cwd(), 'allnet-org.html'), 'utf-8');
  } catch (e) {
    console.error('Could not read allnet-org.html:', e);
    return res.status(500).send('Server error');
  }

  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(ogTitle)}">`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(ogDesc)}">`);
  html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${ogImage}">`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>AllNet — ${escapeHtml(displayName)}</title>`);

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
