// ═══════════════════════════════════════════════
// AllNet — send-spray-notification Edge Function v3
// Uses npm:web-push for proper aes128gcm encryption (Safari/iOS compatible)
// ═══════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = 'BD2IM8REhP6H-At24B4BY4zVfBNTI51ERUS3zx4SbXpHp8vYOHlDNa9YXF8EyjGAv5xaUB36rQ68hcUdhYqIobA'

Deno.serve(async (req) => {
  try {
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'Missing secrets' }), { status: 500 })

    webpush.setVapidDetails('mailto:hello@allnetgames.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const body = await req.json()
    const record = body.record
    if (!record?.match_id || !record?.user_id || !record?.spray_item_id) return new Response(JSON.stringify({ error: 'Invalid record' }), { status: 400 })

    const { match_id, user_id: sprayerUserId, spray_item_id } = record
    console.log(`Spray notification v3: ${sprayerUserId} sprayed match ${match_id}`)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Get sprayer name
    const { data: sprayer } = await supabase.from('profiles').select('name, first_name, last_name').eq('id', sprayerUserId).single()
    const sprayerName = sprayer?.first_name && sprayer?.last_name ? `${sprayer.first_name} ${sprayer.last_name}` : (sprayer?.name || 'Someone')

    // 2. Get spray item name
    const { data: sprayItem } = await supabase.from('store_items').select('name').eq('id', spray_item_id).single()
    const sprayName = sprayItem?.name || 'a spray'

    // 3. Get match details
    const { data: match } = await supabase.from('match_feed').select('court_name, team_a, team_b').eq('id', match_id).single()
    if (!match) { console.log('Match not found'); return new Response(JSON.stringify({ skipped: true, reason: 'match not found' })) }

    // 4. Extract participant user_ids — with name-based fallback
    const teamA = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a
    const teamB = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b
    const allPlayers = [...(teamA || []), ...(teamB || [])]
    const participantIdSet = new Set()
    const namesWithoutIds = []
    for (const p of allPlayers) {
      if (p.user_id && p.user_id !== sprayerUserId) { participantIdSet.add(p.user_id) }
      else if (!p.user_id && p.name) { namesWithoutIds.push(p.name) }
    }
    if (namesWithoutIds.length > 0) {
      console.log(`Name fallback for: ${namesWithoutIds.join(', ')}`)
      const { data: nameMatches } = await supabase.from('profiles').select('id, name').in('name', namesWithoutIds)
      if (nameMatches) { for (const p of nameMatches) { if (p.id !== sprayerUserId) participantIdSet.add(p.id) } }
    }
    const participantIds = [...participantIdSet]
    if (participantIds.length === 0) { console.log('No participants'); return new Response(JSON.stringify({ skipped: true, reason: 'no participants' })) }
    console.log(`Found ${participantIds.length} participants`)

    // 5. Check push_spray_alerts preference
    const { data: profiles } = await supabase.from('profiles').select('id, push_spray_alerts').in('id', participantIds)
    const eligibleIds = (profiles || []).filter(p => p.push_spray_alerts !== false).map(p => p.id)
    if (eligibleIds.length === 0) { console.log('All opted out'); return new Response(JSON.stringify({ skipped: true, reason: 'all opted out' })) }

    // 6. Insert in-app notifications
    const notifTitle = `${sprayerName} sprayed your post`
    const notifBody = `Used ${sprayName} on your game at ${match.court_name}`
    const notifRows = eligibleIds.map(uid => ({ user_id: uid, type: 'post_sprayed', title: notifTitle, body: notifBody, match_id: match_id, read: false }))
    const { error: notifError } = await supabase.from('notifications').insert(notifRows)
    if (notifError) console.error('Notification insert error:', notifError)
    else console.log(`Inserted ${notifRows.length} in-app notifications`)

    // 7. Get push subscriptions
    const { data: subscriptions } = await supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', eligibleIds)
    if (!subscriptions || subscriptions.length === 0) return new Response(JSON.stringify({ inAppSent: notifRows.length, pushSent: 0, reason: 'no push subscriptions' }))

    // 8. Send push via npm:web-push (proper aes128gcm for Safari/iOS)
    const pushPayload = JSON.stringify({ title: notifTitle, body: notifBody, matchId: match_id, type: 'post_sprayed', url: '/allnet-activity.html' })
    const results = []
    for (const sub of subscriptions) {
      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
      try {
        await webpush.sendNotification(pushSub, pushPayload, { TTL: 86400, urgency: 'normal' })
        results.push({ success: true })
        console.log(`Push sent to ${sub.user_id}`)
      } catch (err) {
        console.error(`Push failed for ${sub.user_id}: ${err.statusCode || err.message}`)
        results.push({ success: false, status: err.statusCode })
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          console.log(`Cleaned stale subscription`)
        }
      }
    }
    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    console.log(`Spray notification: ${sent} push sent, ${failed} failed, ${notifRows.length} in-app`)
    return new Response(JSON.stringify({ sprayerName, sprayName, courtName: match.court_name, inAppSent: notifRows.length, pushSent: sent, pushFailed: failed }))
  } catch (err) { console.error('send-spray-notification error:', err); return new Response(JSON.stringify({ error: err.message }), { status: 500 }) }
})
