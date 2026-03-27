// ═══════════════════════════════════════════════
// AllNet — send-spray-notification Edge Function v2
// Triggered by DB trigger on post_sprays INSERT
// Notifies all match participants (both teams) except the sprayer
// v2: Added name-based profile fallback when user_id is missing from JSONB
// ═══════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = 'BD2IM8REhP6H-At24B4BY4zVfBNTI51ERUS3zx4SbXpHp8vYOHlDNa9YXF8EyjGAv5xaUB36rQ68hcUdhYqIobA'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, c => c.charCodeAt(0))
}

function uint8ArrayToUrlBase64(uint8Array) {
  let binary = ''
  for (const byte of uint8Array) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importVapidKeys(publicKeyB64, privateKeyB64) {
  const publicKeyBytes = urlBase64ToUint8Array(publicKeyB64)
  const privateKeyBytes = urlBase64ToUint8Array(privateKeyB64)
  const publicKey = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, true, [])
  const jwk = { kty: 'EC', crv: 'P-256', x: uint8ArrayToUrlBase64(publicKeyBytes.slice(1, 33)), y: uint8ArrayToUrlBase64(publicKeyBytes.slice(33, 65)), d: uint8ArrayToUrlBase64(privateKeyBytes), ext: true }
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  return { publicKey, privateKey }
}

async function createVapidAuthHeader(endpoint, vapidKeys, subject) {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }
  const enc = new TextEncoder()
  const headerB64 = uint8ArrayToUrlBase64(enc.encode(JSON.stringify(header)))
  const payloadB64 = uint8ArrayToUrlBase64(enc.encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKeys.privateKey, enc.encode(unsignedToken))
  const sigB64 = uint8ArrayToUrlBase64(new Uint8Array(signature))
  const jwt = `${unsignedToken}.${sigB64}`
  const pubKeyRaw = await crypto.subtle.exportKey('raw', vapidKeys.publicKey)
  const pubKeyB64 = uint8ArrayToUrlBase64(new Uint8Array(pubKeyRaw))
  return { Authorization: `vapid t=${jwt}, k=${pubKeyB64}` }
}

async function encryptPayload(subscription, payload) {
  const enc = new TextEncoder()
  const payloadBytes = enc.encode(JSON.stringify(payload))
  const localKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const clientPublicKeyBytes = urlBase64ToUint8Array(subscription.p256dh)
  const clientPublicKey = await crypto.subtle.importKey('raw', clientPublicKeyBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPublicKey }, localKeyPair.privateKey, 256)
  const authSecret = urlBase64ToUint8Array(subscription.auth)
  const localPublicKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey)
  const localPublicKeyBytes = new Uint8Array(localPublicKeyRaw)
  const sharedSecretKey = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits'])
  const authInfo = enc.encode('Content-Encoding: auth\0')
  const prkBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: authInfo }, sharedSecretKey, 256)
  const prkKey = await crypto.subtle.importKey('raw', prkBits, { name: 'HKDF' }, false, ['deriveBits'])
  function buildInfo(type, clientPub, serverPub) {
    const info = new Uint8Array(enc.encode(`Content-Encoding: ${type}\0P-256\0`).length + 2 + clientPub.length + 2 + serverPub.length)
    let offset = 0
    const prefix = enc.encode(`Content-Encoding: ${type}\0P-256\0`)
    info.set(prefix, offset); offset += prefix.length
    info[offset++] = 0; info[offset++] = clientPub.length
    info.set(clientPub, offset); offset += clientPub.length
    info[offset++] = 0; info[offset++] = serverPub.length
    info.set(serverPub, offset)
    return info
  }
  const keyInfo = buildInfo('aesgcm', clientPublicKeyBytes, localPublicKeyBytes)
  const nonceInfo = buildInfo('nonce', clientPublicKeyBytes, localPublicKeyBytes)
  const cekBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: keyInfo }, prkKey, 128)
  const nonceBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: nonceInfo }, prkKey, 96)
  const padded = new Uint8Array(2 + payloadBytes.length)
  padded[0] = 0; padded[1] = 0
  padded.set(payloadBytes, 2)
  const cekKey = await crypto.subtle.importKey('raw', cekBits, { name: 'AES-GCM' }, false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBits }, cekKey, padded)
  return { ciphertext: new Uint8Array(encrypted), localPublicKey: localPublicKeyBytes, salt: crypto.getRandomValues(new Uint8Array(16)) }
}

async function sendWebPush(subscription, payload, vapidKeys) {
  try {
    const encrypted = await encryptPayload(subscription, payload)
    const vapidHeaders = await createVapidAuthHeader(subscription.endpoint, vapidKeys, 'mailto:hello@allnetgames.com')
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: { ...vapidHeaders, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aesgcm', 'Crypto-Key': `dh=${uint8ArrayToUrlBase64(encrypted.localPublicKey)};${vapidHeaders['Crypto-Key'] || ''}`, 'Encryption': `salt=${uint8ArrayToUrlBase64(encrypted.salt)}`, 'TTL': '86400', 'Urgency': 'normal' },
      body: encrypted.ciphertext
    })
    if (!response.ok) { const text = await response.text(); console.error(`Push failed (${response.status}): ${text}`); return { success: false, status: response.status, endpoint: subscription.endpoint } }
    return { success: true, status: response.status }
  } catch (err) { console.error('Push send error:', err); return { success: false, error: err.message, endpoint: subscription.endpoint } }
}

Deno.serve(async (req) => {
  try {
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'Missing secrets' }), { status: 500 })

    const body = await req.json()
    const record = body.record
    if (!record?.match_id || !record?.user_id || !record?.spray_item_id) return new Response(JSON.stringify({ error: 'Invalid record' }), { status: 400 })

    const { match_id, user_id: sprayerUserId, spray_item_id } = record
    console.log(`Spray notification v2: ${sprayerUserId} sprayed match ${match_id}`)
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
      if (p.user_id && p.user_id !== sprayerUserId) {
        participantIdSet.add(p.user_id)
      } else if (!p.user_id && p.name) {
        namesWithoutIds.push(p.name)
      }
    }

    // Fallback: look up profiles by name for players missing user_id
    if (namesWithoutIds.length > 0) {
      console.log(`Name-based fallback for ${namesWithoutIds.length} players: ${namesWithoutIds.join(', ')}`)
      const { data: nameMatches } = await supabase.from('profiles').select('id, name').in('name', namesWithoutIds)
      if (nameMatches) {
        for (const p of nameMatches) {
          if (p.id !== sprayerUserId) { participantIdSet.add(p.id); console.log(`Matched "${p.name}" -> ${p.id}`) }
        }
      }
    }

    const participantIds = [...participantIdSet]
    if (participantIds.length === 0) { console.log('No participants to notify'); return new Response(JSON.stringify({ skipped: true, reason: 'no participants' })) }
    console.log(`Found ${participantIds.length} participants to notify`)

    // 5. Check push_spray_alerts preference
    const { data: profiles } = await supabase.from('profiles').select('id, push_spray_alerts').in('id', participantIds)
    const eligibleIds = (profiles || []).filter(p => p.push_spray_alerts !== false).map(p => p.id)
    if (eligibleIds.length === 0) { console.log('All participants opted out'); return new Response(JSON.stringify({ skipped: true, reason: 'all opted out' })) }

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

    // 8. Send push notifications
    const pushPayload = { title: notifTitle, body: notifBody, matchId: match_id, type: 'post_sprayed', url: '/allnet-activity.html' }
    const vapidKeys = await importVapidKeys(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const results = []
    for (const sub of subscriptions) {
      const result = await sendWebPush(sub, pushPayload, vapidKeys)
      results.push(result)
      if (result.status === 410) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); console.log(`Cleaned stale subscription: ${sub.endpoint}`) }
    }
    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    console.log(`Spray notification: ${sent} push sent, ${failed} failed, ${notifRows.length} in-app`)
    return new Response(JSON.stringify({ sprayerName, sprayName, courtName: match.court_name, inAppSent: notifRows.length, pushSent: sent, pushFailed: failed }))
  } catch (err) { console.error('send-spray-notification error:', err); return new Response(JSON.stringify({ error: err.message }), { status: 500 }) }
})
