import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = 'BD2IM8REhP6H-At24B4BY4zVfBNTI51ERUS3zx4SbXpHp8vYOHlDNa9YXF8EyjGAv5xaUB36rQ68hcUdhYqIobA'
const COOLDOWN_MINUTES = 15

// Thresholds: [count, type, titleSuffix, body]
const THRESHOLDS = [
  [1, 'court_active', 'is now Active', 'Someone just checked in \u2014 head over to get a run going \uD83C\uDFC0'],
  [3, 'court_heating_up', 'is heating up', '3 players checked in \u2014 a run is forming \uD83D\uDD25'],
  [5, 'court_packed', 'is Packed!', '5+ players on court \u2014 games are running \uD83C\uDFC0'],
]

Deno.serve(async (req) => {
  try {
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing secrets' }), { status: 500 })
    }

    webpush.setVapidDetails(
      'mailto:hello@allnetgames.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    )

    const body = await req.json()
    const record = body.record
    if (!record?.court_id) {
      return new Response(JSON.stringify({ error: 'No court_id in record' }), { status: 400 })
    }

    const courtId = record.court_id
    const checkinUserId = record.user_id
    console.log(`Court alert: check-in at ${courtId} by ${checkinUserId}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Count active check-ins at this court
    const { count, error: countError } = await supabase
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .eq('court_id', courtId)
      .is('checked_out_at', null)

    if (countError) {
      console.error('Count error:', countError)
      return new Response(JSON.stringify({ error: 'Count failed' }), { status: 500 })
    }

    console.log(`Court ${courtId}: ${count} active check-ins`)

    // 2. Find matching threshold
    const threshold = THRESHOLDS.find(t => count === t[0])
    if (!threshold) {
      return new Response(JSON.stringify({ skipped: true, count }))
    }

    const [, notifType, titleSuffix, notifBodyTemplate] = threshold

    // 3. Get court name
    const { data: court } = await supabase
      .from('courts')
      .select('name')
      .eq('id', courtId)
      .single()

    const courtName = court?.name || 'A court you watch'
    const notifTitle = `${courtName} ${titleSuffix}`
    const notifBody = count > 1
      ? notifBodyTemplate.replace(/\d+ players/, `${count} players`)
      : notifBodyTemplate

    // 4. Get watchers (exclude the person who just checked in)
    const { data: watchers } = await supabase
      .from('court_watches')
      .select('user_id')
      .eq('court_id', courtId)
      .neq('user_id', checkinUserId)

    if (!watchers || watchers.length === 0) {
      console.log('No watchers for this court')
      return new Response(JSON.stringify({ skipped: true, reason: 'no watchers' }))
    }

    const watcherIds = watchers.map(w => w.user_id)

    // 5. Check cooldowns
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
    const { data: recentCooldowns } = await supabase
      .from('notification_cooldowns')
      .select('user_id')
      .eq('court_id', courtId)
      .in('user_id', watcherIds)
      .gte('sent_at', cooldownCutoff)

    const cooledDownUsers = new Set((recentCooldowns || []).map(c => c.user_id))
    const eligibleWatchers = watcherIds.filter(id => !cooledDownUsers.has(id))

    if (eligibleWatchers.length === 0) {
      console.log('All watchers in cooldown')
      return new Response(JSON.stringify({ skipped: true, reason: 'all in cooldown' }))
    }

    // 6. Check push preferences
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, push_court_alerts')
      .in('id', eligibleWatchers)

    const disabledUsers = new Set(
      (profiles || []).filter(p => p.push_court_alerts === false).map(p => p.id)
    )
    const enabledWatchers = eligibleWatchers.filter(id => !disabledUsers.has(id))

    if (enabledWatchers.length === 0) {
      console.log('All eligible watchers have court alerts disabled')
      return new Response(JSON.stringify({ skipped: true, reason: 'all alerts disabled' }))
    }

    // 7. Get push subscriptions for enabled watchers
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', enabledWatchers)

    // 8. Build push payload
    const payload = JSON.stringify({
      title: notifTitle,
      body: notifBody,
      courtId: courtId,
      url: '/allnet-app.html'
    })

    // 9. Send pushes via npm:web-push (aes128gcm for Safari/iOS)
    const results = []
    const notifiedUserIds = new Set()

    if (subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }

        try {
          const result = await webpush.sendNotification(pushSubscription, payload)
          console.log(`Push sent to ${sub.user_id}: ${result.statusCode}`)
          results.push({ success: true, status: result.statusCode })
          notifiedUserIds.add(sub.user_id)
        } catch (err) {
          console.error(`Push failed for ${sub.user_id}: ${err.statusCode || err.message}`)
          results.push({ success: false, status: err.statusCode, error: err.message })

          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            console.log(`Cleaned up stale subscription for ${sub.user_id}`)
          }
        }
      }
    }

    // 10. Write in-app notifications for ALL enabled watchers
    const notificationRows = enabledWatchers.map(uid => ({
      user_id: uid,
      type: notifType,
      title: notifTitle,
      body: notifBody,
      court_id: courtId,
      read: false
    }))
    const { error: notifError } = await supabase.from('notifications').insert(notificationRows)
    if (notifError) {
      console.error('Failed to write in-app notifications:', notifError)
    } else {
      console.log(`Wrote ${notificationRows.length} in-app notifications`)
    }

    // 11. Record cooldowns
    const cooldownRows = enabledWatchers.map(uid => ({
      court_id: courtId,
      user_id: uid,
    }))
    await supabase.from('notification_cooldowns').insert(cooldownRows)

    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    console.log(`Sent ${sent} push (${failed} failed), ${notificationRows.length} in-app for ${courtName} [${notifType}]`)

    return new Response(JSON.stringify({
      alertType: notifType,
      courtName,
      pushSent: sent,
      pushFailed: failed,
      inAppWritten: notificationRows.length,
      total: subscriptions?.length || 0
    }))

  } catch (err) {
    console.error('send-court-alert error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
