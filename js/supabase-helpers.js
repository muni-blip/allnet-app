// ═══════════════════════════════════════════════
// AllNet — Supabase Client Configuration
// ═══════════════════════════════════════════════
// SQL MIGRATION — run once in Supabase SQL editor:
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
// -- Create avatars storage bucket (in Supabase Dashboard > Storage):
// -- Bucket name: avatars, Public: true

var SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

let sb;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch(e) {
  console.error('Supabase client creation failed:', e);
}
var supabase = sb;
console.log('Supabase client:', supabase ? 'OK' : 'FAILED', 'window.supabase:', typeof window.supabase);

// ── Auth helpers ──
async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getUserProfile(userId) {
  const id = userId || (await getUser())?.id;
  if (!id) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
  return data;
}

async function signUp(email, password, name, location) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, location } }
  });
  if (error) throw error;
  if (data.user) {
    await supabase.from('profiles').update({ location, name, initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }).eq('id', data.user.id);
  }
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await supabase.auth.signOut();
}

// ── Court helpers ──
async function fetchCourts() {
  const { data, error } = await supabase.from('courts').select('*').order('name');
  if (error) throw error;
  return data;
}

async function fetchCourtWithCheckins(courtId) {
  const { data: court } = await supabase.from('courts').select('*').eq('id', courtId).single();
  const { data: checkins } = await supabase
    .from('checkins')
    .select('*, profiles(name, initials, is_founding_hooper, avatar_url, avatar_cutout_url, selected_cover)')
    .eq('court_id', courtId)
    .gte('checked_in_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .is('checked_out_at', null)
    .order('checked_in_at', { ascending: false });
  return { court, checkins: checkins || [] };
}

// ── Check-in helpers ──
async function checkInAtCourt(courtId) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase.from('checkins').insert({ user_id: user.id, court_id: courtId });
  if (error) throw error;
  return data;
}

async function getUserCheckins(userId) {
  const { data } = await supabase
    .from('checkins')
    .select('*, courts(name)')
    .eq('user_id', userId)
    .order('checked_in_at', { ascending: false })
    .limit(20);
  return data || [];
}

// ── Game session helpers ──
async function createGameSession(courtId, format, teamSize, codeA, codeB) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase.from('game_sessions').insert({
    court_id: courtId,
    creator_id: user.id,
    format,
    team_size: teamSize,
    code_a: codeA,
    code_b: codeB,
    status: 'lobby'
  }).select().single();
  if (error) throw error;
  await supabase.from('game_players').insert({ game_id: data.id, user_id: user.id, team: 'a' });
  return data;
}

async function joinGameByCode(code) {
  const { data: gameA } = await supabase.from('game_sessions')
    .select('*').eq('code_a', code).in('status', ['lobby', 'active']).single();
  const { data: gameB } = await supabase.from('game_sessions')
    .select('*').eq('code_b', code).in('status', ['lobby', 'active']).single();
  const game = gameA || gameB;
  if (!game) throw new Error('Game not found');
  const team = gameA ? 'a' : 'b';
  const user = await getUser();
  await supabase.from('game_players').insert({ game_id: game.id, user_id: user.id, team });
  return { game, team };
}

async function startGameSession(gameId) {
  await supabase.from('game_sessions').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', gameId);
}

async function endGameSession(gameId, durationSeconds) {
  await supabase.from('game_sessions').update({
    status: 'review',
    ended_at: new Date().toISOString(),
    duration_seconds: durationSeconds
  }).eq('id', gameId);
}

async function completeGame(gameId, winner) {
  await supabase.from('game_sessions').update({ status: 'completed', winner }).eq('id', gameId);
}

async function getGamePlayers(gameId) {
  const { data } = await supabase.from('game_players')
    .select('*, profiles(name, initials, is_founding_hooper)')
    .eq('game_id', gameId);
  return data || [];
}

// ── Review helpers ──
async function submitReview(gameId, revieweeId, skillRating, socialRating, relationship) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('reviews').insert({
    game_id: gameId,
    reviewer_id: user.id,
    reviewee_id: revieweeId,
    skill_rating: skillRating,
    social_rating: socialRating,
    relationship
  });
  if (error) throw error;
}

// ── Player card helper ──
async function getPlayerCard(userId) {
  const { data } = await supabase.from('player_cards').select('*').eq('id', userId).single();
  return data;
}

// ── Court report helpers ──
async function reportCourt(courtId, reason, note) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('court_reports').insert({
    court_id: courtId,
    user_id: user.id,
    reason: reason || 'no_basketball_court',
    note: note || null
  });
  if (error) throw error;
}

async function hasUserReported(courtId) {
  const user = await getUser();
  if (!user) return false;
  const { data } = await supabase.from('court_reports')
    .select('id')
    .eq('court_id', courtId)
    .eq('user_id', user.id)
    .maybeSingle();
  return !!data;
}

// ── Realtime subscriptions ──
function subscribeToCheckins(courtId, callback) {
  return supabase.channel('checkins-' + courtId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: 'court_id=eq.' + courtId }, callback)
    .subscribe();
}

function subscribeToGamePlayers(gameId, callback) {
  return supabase.channel('game-' + gameId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_players', filter: 'game_id=eq.' + gameId }, callback)
    .subscribe();
}

// ── Notification helpers ──
async function getNotifications(limit) {
  const user = await getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit || 50);
  return data || [];
}

async function getUnreadNotificationCount() {
  const user = await getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);
  return count || 0;
}

async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  return !error;
}

async function markAllNotificationsRead() {
  const user = await getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
  return !error;
}

async function updatePushPreference(key, value) {
  const user = await getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ [key]: value })
    .eq('id', user.id);
  return !error;
}

// ── Shared time formatting (Instagram-style) ──
function timeAgo(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : m + ' minutes ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? '1 day ago' : d + ' days ago';
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (date.getFullYear() === now.getFullYear()) {
    return months[date.getMonth()] + ' ' + date.getDate();
  }
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

/* ═══════════════════════════════════════
   SHARED COMPOSITE AVATAR BUILDER
   Creates a circular avatar with cutout + cover bg.
   Works for any profile object with avatar_cutout_url,
   avatar_url, selected_cover, initials fields.
   ═══════════════════════════════════════ */
var _COVERS_BASE = 'https://orrpowyewsioyxztwkdq.supabase.co/storage/v1/object/public/covers';
var _COVERS_MAP = {
  crossover: _COVERS_BASE + '/Crossover.png', rally: _COVERS_BASE + '/Rally.png',
  flowstate: _COVERS_BASE + '/Flowstate.png', fastbreak: _COVERS_BASE + '/Fastbreak.png',
  shatter: _COVERS_BASE + '/Shatter.png', showtime: _COVERS_BASE + '/Showtime.png',
  fadeaway: _COVERS_BASE + '/Fadeaway.png'
};

function buildCompositeAvatarHtml(profile) {
  if (!profile) return '??';
  var cutout = profile.avatar_cutout_url;
  var rawUrl = profile.avatar_url;
  var cover = profile.selected_cover || 'crossover';
  var coverUrl = _COVERS_MAP[cover] || _COVERS_MAP.crossover;
  var initials = profile.initials || (profile.name || '??').split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);

  if (cutout) {
    return '<div class="av-comp" style="position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;">' +
      '<div style="position:absolute;inset:0;background-image:url(\'' + coverUrl + '\');background-size:cover;background-position:center;"></div>' +
      '<img src="' + cutout + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" onerror="this.style.display=\'none\'">' +
    '</div>';
  }
  if (rawUrl) {
    return '<img src="' + rawUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">';
  }
  return initials;
}

/* ═══════════════════════════════════════
   SHARED NAV BAR — populates stars, bell, avatar
   on any page that includes the .nav-bar element.
   Call from each page's init after Supabase is ready.
   ═══════════════════════════════════════ */
async function initNavBar() {
  var starsEl = document.getElementById('topBarStars');
  var starsCount = document.getElementById('topBarStarsCount');
  var bellEl = document.getElementById('navBell');
  var badgeEl = document.getElementById('navBellBadge');
  var profileBtn = document.getElementById('profileBtn');
  if (!profileBtn) return; // no nav bar on this page

  try {
    var session = (await supabase.auth.getSession()).data.session;
    if (!session) return; // not logged in — keep "Get Started" CTA

    var profile = await getUserProfile(session.user.id);
    if (!profile) return;

    // Stars
    if (starsEl && starsCount) {
      starsCount.textContent = (profile.stars_balance || 0).toLocaleString();
      starsEl.style.display = 'flex';
    }

    // Bell + unread badge
    if (bellEl) {
      bellEl.style.display = 'flex';
      try {
        var { count } = await supabase
          .from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id).eq('read', false);
        if (badgeEl) {
          if (count && count > 0) {
            badgeEl.textContent = count > 99 ? '99+' : count;
            badgeEl.style.display = 'flex';
          } else {
            badgeEl.style.display = 'none';
          }
        }
      } catch (e) { if (badgeEl) badgeEl.style.display = 'none'; }
    }

    // Avatar — replace CTA with composite avatar
    profileBtn.className = 'nav-bar__avatar';
    profileBtn.onclick = function() { window.location.href = 'allnet-app.html'; };
    profileBtn.innerHTML = buildCompositeAvatarHtml(profile);
  } catch (err) {
    console.error('initNavBar error:', err);
  }
}

// Fallback handlers for secondary pages (overridden by app.js on Play page)
if (typeof openNotifications === 'undefined') {
  var openNotifications = function() { window.location.href = 'allnet-app.html'; };
}
if (typeof handleProfileClick === 'undefined') {
  var handleProfileClick = function() { window.location.href = 'allnet-app.html'; };
}
