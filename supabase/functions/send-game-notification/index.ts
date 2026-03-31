import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = 'BD2IM8REhP6H-At24B4BY4zVfBNTI51ERUS3zx4SbXpHp8vYOHlDNa9YXF8EyjGAv5xaUB36rQ68hcUdhYqIobA'

Deno.serve(async (req) => {
  try {
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing secrets' }), { status: 500 })
    }

    webpush.setVapidDetails('mailto:hello@allnetgames.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const body = await req.json()
    const { type, game_id, user_ids, skip_push } = body
    // type: player_joined | review_reminder | review_reminder_urgent | game_complete | review_penalty
    // user_ids: array of user IDs to notify
    // skip_push: if true, only write in-app notification (no push)

    if (!type || !game_id || !user_ids || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing type, game_id, or user_ids' }), { status: 400 })
    }

    console.log(`Game notification: type=${type}, game=${game_id}, users=${user_ids.length}`)

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Fetch game details
    const { data: game } = await supabase
      .from('game_sessions')
      .select('format, court_id, courts(name)')
      .eq('id', game_id)
      .single()

    const courtName = (game as any)?.courts?.name || 'Unknown Court'
    const format = game?.format || 'Game'

    // Build notification content based on type
    let title = ''
    let notifBody = ''
    let tapUrl = '/allnet-app.html'
    let notifType = type

    switch (type) {
      case 'player_joined': {
        const joinerName = body.joiner_name || 'A player'
        title = `${joinerName} joined your game`
        notifBody = `${format} at ${courtName}`
        tapUrl = `/allnet-phase2.html?mode=lobby&game_id=${game_id}`
        break
      }
      case 'review_reminder': {
        title = "Don't forget to review"
        notifBody = `You have pending reviews for your ${format} at ${courtName}`
        tapUrl = `/allnet-phase2.html?mode=review&game_id=${game_id}`
        break
      }
      case 'review_reminder_urgent': {
        title = 'Review deadline in 1 hour'
        notifBody = `Submit reviews for your ${format} at ${courtName} or your rating will be penalized`
        tapUrl = `/allnet-phase2.html?mode=review&game_id=${game_id}`
        notifType = 'review_reminder' // same type in notifications table
        break
      }
      case 'game_complete': {
        title = 'Game complete \u2014 ratings updated!'
        notifBody = `All reviews are in for your ${format} at ${courtName}. Check your career card!`
        tapUrl = '/allnet-career.html'
        break
      }
      case 'review_penalty': {
        title = 'Rating penalty applied'
        notifBody = `You missed the review deadline for your ${format} at ${courtName}. Social -0.2, Skill -0.1`
        tapUrl = '/allnet-app.html'
        break
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400 })
    }

    // Check push preferences for each user
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, push_game_alerts')
      .in('id', user_ids)

    const disabledUsers = new Set(
      (profiles || []).filter(p => p.push_game_alerts === false).map(p => p.id)
    )

    // Write in-app notifications for ALL users (regardless of push preference)
    const notificationRows = user_ids.map((uid: string) => ({
      user_id: uid,
      type: notifType,
      title,
      body: notifBody,
      game_id,
      court_id: game?.court_id || null,
      read: false
    }))

    const { error: notifError } = await supabase.from('notifications').insert(notificationRows)
    if (notifError) console.error('Failed to write in-app notifications:', notifError)
    else console.log(`Wrote ${notificationRows.length} in-app notifications`)

    // Send push notifications (skip if skip_push or user disabled)
    let pushSent = 0
    let pushFailed = 0

    if (!skip_push) {
      const pushEligible = user_ids.filter((uid: string) => !disabledUsers.has(uid))

      if (pushEligible.length > 0) {
        const { data: subscriptions } = await supabase
          .from('push_subscriptions')
          .select('user_id, endpoint, p256dh, auth')
          .in('user_id', pushEligible)

        const payload = JSON.stringify({
          title,
          body: notifBody,
          gameId: game_id,
          type: notifType,
          url: tapUrl
        })

        if (subscriptions && subscriptions.length > 0) {
          for (const sub of subscriptions) {
            try {
              const result = await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                { TTL: 86400, urgency: 'normal' }
              )
              console.log(`Push sent to ${sub.user_id}: ${result.statusCode}`)
              pushSent++
            } catch (err: any) {
              console.error(`Push failed for ${sub.user_id}: ${err.statusCode || err.message}`)
              pushFailed++
              if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
                console.log(`Cleaned up stale subscription for ${sub.user_id}`)
              }
            }
          }
        }
      }
    }

    console.log(`Game notification done: type=${type}, inApp=${notificationRows.length}, pushSent=${pushSent}, pushFailed=${pushFailed}`)

    return new Response(JSON.stringify({
      type,
      gameId: game_id,
      inAppWritten: notificationRows.length,
      pushSent,
      pushFailed
    }))

  } catch (err: any) {
    console.error('send-game-notification error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
