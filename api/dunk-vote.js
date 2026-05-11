import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { submission_id } = req.body || {};
  if (!submission_id) {
    return res.status(400).json({ success: false, error: 'Missing submission_id' });
  }

  // Get voter IP from headers
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || '0.0.0.0';

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb.rpc('cast_dunk_vote', {
      p_submission_id: submission_id,
      p_user_id: null,
      p_ip_address: ip,
    });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('Vote error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
}
