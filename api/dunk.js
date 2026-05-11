import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  const id = req.query.id || '';
  if (!id) return res.redirect(302, '/');

  let submission = null;
  let profile = null;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb
      .from('dunk_submissions')
      .select('*, profile:profiles!dunk_submissions_user_id_fkey(first_name, last_name, username, avatar_cutout_url, selected_cover)')
      .eq('id', id)
      .maybeSingle();
    submission = data;
    profile = data?.profile;
  } catch (e) {
    console.error('Dunk fetch error:', e);
  }

  if (!submission) {
    return res.status(404).send('Submission not found');
  }

  const displayName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : 'Player';
  const votes = submission.net_votes ?? 0;

  const ogTitle = `${displayName}'s Dunk on AllNet`;
  const ogDesc = `${votes >= 0 ? '+' : ''}${votes} votes — Watch and vote on this dunk!`;
  const ogUrl = `https://allnetgames.com/dunk/${id}`;

  let html;
  try {
    html = readFileSync(join(process.cwd(), 'allnet-dunk.html'), 'utf-8');
  } catch (e) {
    console.error('Could not read allnet-dunk.html:', e);
    return res.status(500).send('Server error');
  }

  // Inject submission data as JSON for the client
  const submissionData = JSON.stringify({
    id: submission.id,
    videoUrl: submission.video_url,
    playerName: displayName,
    username: profile?.username || '',
    avatarCutoutUrl: profile?.avatar_cutout_url || null,
    selectedCover: profile?.selected_cover || null,
    netVotes: votes,
    state: submission.state,
    createdAt: submission.created_at,
  });

  html = html.replace('__SUBMISSION_DATA__', submissionData);
  html = html.replace(/__OG_TITLE__/g, escapeHtml(ogTitle));
  html = html.replace(/__OG_DESC__/g, escapeHtml(ogDesc));
  html = html.replace(/__OG_URL__/g, ogUrl);
  html = html.replace(/__DISPLAY_NAME__/g, escapeHtml(displayName));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
  return res.status(200).send(html);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
