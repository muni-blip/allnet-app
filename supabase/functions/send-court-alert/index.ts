// ═══════════════════════════════════════════════
// AllNet — send-court-alert Edge Function
// Triggered by Supabase webhook on checkins INSERT
// ═══════════════════════════════════════════════
// Deploy: supabase functions deploy send-court-alert
// Set secret: supabase secrets set VAPID_PRIVATE_KEY=UXQbHxh9OHE210pFZ7d9Ip-mBuV3Vxst977DurPs8SE
// Webhook setup: Database → Webhooks → New → Table: checkins, Event: INSERT
//   URL: https://orrpowyewsioyxztwkdq.supabase.co/functions/v1/send-court-alert
//   Headers: Authorization: Bearer <service_role_key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = 'BD2IM8REhP6H-At24B4BY4zVfBNTI51ERUS3zx4SbXpHp8vYOHlDNa9YXF8EyjGAv5xaUB36rQ68hcUdhYqIobA'
const COOLDOWN_MINUTES = 15
const ACTIVE_THRESHOLD = 1
const PACKED_THRESHOLD = 5

// ── Web Push crypto helpers ──
// Uses Web Crypto API available in Deno/Edge Functions

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

  // Import public key as raw P-256
  const publicKey = await crypto.subtle.importKey(
    'raw', publicKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, []
  )

  // Import private key — need to construct JWK from raw 32 bytes
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: uint8ArrayToUrlBase64(publicKeyBytes.slice(1, 33)),
    y: uint8ArrayToUrlBase64(publicKeyBytes.slice(33, 65)),
    d: uint8ArrayToUrlBase64(privateKeyBytes),
    ext: true
  }
  const privateKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, ['sign']
  )

  return { publicKey, privateKey }
}

async function createVapidAuthHeader(endpoint, vapidKeys, subject) {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`

  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject
  }

  const enc = new TextEncoder()
  const headerB64 = uint8ArrayToUrlBase64(enc.encode(JSON.stringify(header)))
  const payloadB64 = uint8ArrayToUrlBase64(enc.encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapidKeys.privateKey,
    enc.encode(unsignedToken)
  )

  // Convert DER signature to raw r||s format if needed
  const sigArray = new Uint8Array(signature)
  const sigB64 = uint8ArrayToUrlBase64(sigArray)
  const jwt = `${unsignedToken}.${sigB64}`

  // Export public key as raw bytes for p256ecdsa
  const pubKeyRaw = await crypto.subtle.exportKey('raw', vapidKeys.publicKey)
  const pubKeyB64 = uint8ArrayToUrlBase64(new Uint8Array(pubKeyRaw))

  return {
    Authorization: `vapid t=${jwt}, k=${pubKeyB64}`,
  }
}

async function encryptPayload(subscription, payload) {
  const enc = new TextEncoder()
  const payloadBytes = enc.encode(JSON.stringify(payload))

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits']
  )

  // Import subscriber's public key
  const clientPublicKeyBytes = urlBase64ToUint8Array(subscription.p256dh)
  const clientPublicKey = await crypto.subtle.importKey(
    'raw', clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  )

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    localKeyPair.privateKey, 256
  )

  // Auth secret from subscription
  const authSecret = urlBase64ToUint8Array(subscription.auth)

  // Export local public key
  const localPublicKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey)
  const localPublicKeyBytes = new Uint8Array(localPublicKeyRaw)

  // HKDF-based key derivation (RFC 8291)
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']
  )

  // PRK = HKDF-Extract(auth_secret, ecdh_secret)
  const authInfo = enc.encode('Content-Encoding: auth\0')
  const prkBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: authInfo },
    sharedSecretKey, 256
  )
  const prkKey = await crypto.subtle.importKey(
    'raw', prkBits, { name: 'HKDF' }, false, ['deriveBits']
  )

  // Build key_info and nonce_info
  function buildInfo(type, clientPub, serverPub) {
    const info = new Uint8Array(
      enc.encode(`Content-Encoding: ${type}\0P-256\0`).length + 2 + clientPub.length + 2 + serverPub.length
    )
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

  // Derive content encryption key (16 bytes) and nonce (12 bytes)
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: keyInfo },
    prkKey, 128
  )
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: nonceInfo },
    prkKey, 96
  )

  // Pad the payload (2 bytes padding length + padding + payload)
  const paddingLength = 0
  const padded = new Uint8Array(2 + paddingLength + payloadBytes.length)
  padded[0] = 0; padded[1] = 0
  padded.set(payloadBytes, 2 + paddingLength)

  // Encrypt with AES-128-GCM
  const cekKey = await crypto.subtle.importKey(
    'raw', cekBits, { name: 'AES-GCM' }, false, ['encrypt']
  )
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBits },
    cekKey, padded
  )

  return {
    ciphertext: new Uint8Array(encrypted),
    localPublicKey: localPublicKeyBytes,
    salt: crypto.getRandomValues(new Uint8Array(16))
  }
}

async function sendWebPush(subscription, payload, vapidKeys) {
  try {
    const encrypted = await encryptPayload(subscription, payload)
    const vapidHeaders = await createVapidAuthHeader(
      subscription.endpoint, vapidKeys, 'mailto:hello@allnetgames.com'
    )

    const body = encrypted.ciphertext
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...vapidHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aesgcm',
        'Crypto-Key': `dh=${uint8ArrayToUrlBase64(encrypted.localPublicKey)};${vapidHeaders['Crypto-Key'] || ''}`,
        'Encryption': `salt=${uint8ArrayToUrlBase64(encrypted.salt)}`,
        'TTL': '86400',
        'Urgency': 'high',
      },
      body
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`Push failed (${response.status}): ${text}`)
      return { success: false, status: response.status, endpoint: subscription.endpoint }
    }

    return { success: true, status: response.status }
  } catch (err) {
    console.error('Push send error:', err)
    return { success: false, error: err.message, endpoint: subscription.endpoint }
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  try {
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing secrets' }), { status: 500 })
    }

    const body = await req.json()

    // Webhook payload: { type: 'INSERT', table: 'checkins', record: { ... } }
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

    // 2. Determine alert type
    let alertType = null
    if (count === ACTIVE_THRESHOLD) {
      alertType = 'active'
    } else if (count === PACKED_THRESHOLD) {
      alertType = 'packed'
    }

    if (!alertType) {
      // No threshold crossed — skip
      return new Response(JSON.stringify({ skipped: true, count }))
    }

    // 3. Get court name
    const { data: court } = await supabase
      .from('courts')
      .select('name')
      .eq('id', courtId)
      .single()

    const courtName = court?.name || 'A court you watch'

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

    // 5. Check cooldowns — skip users who got a notification for this court in last 15 min
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

    // 6. Get push subscriptions for eligible watchers
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', eligibleWatchers)

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions for eligible watchers')
      return new Response(JSON.stringify({ skipped: true, reason: 'no subscriptions' }))
    }

    // 7. Build notification payload
    const payload = {
      title: alertType === 'active'
        ? `${courtName} is now Active`
        : `${courtName} is Packed!`,
      body: alertType === 'active'
        ? `Someone just checked in — head over to get a run going 🏀`
        : `${count} players on court — games are running 🔥`,
      courtId: courtId,
      url: '/allnet-app.html'
    }

    // 8. Import VAPID keys and send pushes
    const vapidKeys = await importVapidKeys(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const results = []
    const notifiedUserIds = new Set()

    for (const sub of subscriptions) {
      const result = await sendWebPush(sub, payload, vapidKeys)
      results.push(result)

      if (result.success) {
        notifiedUserIds.add(sub.user_id)
      }

      // If endpoint is gone (410 Gone), clean up the stale subscription
      if (result.status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        console.log(`Cleaned up stale subscription: ${sub.endpoint}`)
      }
    }

    // 9. Record cooldowns for notified users
    if (notifiedUserIds.size > 0) {
      const cooldownRows = Array.from(notifiedUserIds).map(uid => ({
        court_id: courtId,
        user_id: uid,
      }))
      await supabase.from('notification_cooldowns').insert(cooldownRows)
    }

    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    console.log(`Sent ${sent} push notifications (${failed} failed) for ${courtName} [${alertType}]`)

    return new Response(JSON.stringify({
      alertType,
      courtName,
      sent,
      failed,
      total: subscriptions.length
    }))

  } catch (err) {
    console.error('send-court-alert error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
