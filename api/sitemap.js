import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: courts } = await sb.from('courts').select('slug').not('slug', 'is', null).order('slug');

    const base = 'https://allnetgames.com';
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/allnet-landing.html</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${base}/allnet-app.html</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`;

    if (courts) {
      for (const c of courts) {
        xml += `\n  <url><loc>${base}/courts/${c.slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
      }
    }

    xml += '\n</urlset>';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(xml);
  } catch (e) {
    console.error('Sitemap error:', e);
    return res.status(500).send('Error generating sitemap');
  }
}
