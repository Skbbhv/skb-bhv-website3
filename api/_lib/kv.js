// api/_lib/kv.js
// Opslag via Supabase (vervangt de oude Redis-koppeling, die tweemaal verdween).
// Biedt dezelfde functies als voorheen (get, set, del, incr, expire, sadd, srem, scard, smembers),
// zodat de rest van de code niet hoeft te veranderen. Waarden worden als JSON bewaard.
//
// Vereiste environment variables:
//   SUPABASE_URL        bijv. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY   publishable/anon key van het project
//   KV_SECRET           geheim dat de database-functies controleren (alleen server-side)

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.KV_SECRET;
  if (!url || !key || !secret) {
    throw new Error('Supabase-opslag niet ingesteld: SUPABASE_URL, SUPABASE_ANON_KEY en KV_SECRET zijn vereist.');
  }
  return { url: url.replace(/\/$/, ''), key, secret };
}

async function rpc(fn, args) {
  const { url, key, secret } = cfg();
  const res = await fetch(`${url}/rest/v1/rpc/skbbhv_kv_${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_secret: secret, ...args }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Supabase-opslagfout (${fn}):`, res.status, text);
    throw new Error(`Opslagfout ${res.status} bij ${fn}`);
  }
  return text ? JSON.parse(text) : null;
}

export const kv = {
  async get(key) {
    const v = await rpc('get', { p_key: key });
    return v === undefined ? null : v;
  },
  // options: { nx: true } alleen zetten als hij nog niet bestaat, { ex: seconden } verlooptijd
  async set(key, value, options = {}) {
    const ok = await rpc('set', {
      p_key: key,
      p_value: value === undefined ? null : value,
      p_nx: !!options.nx,
      p_ex: options.ex ? Math.floor(options.ex) : null,
    });
    return ok ? 'OK' : null;
  },
  async del(key) {
    return await rpc('del', { p_key: key });
  },
  async incr(key) {
    return Number(await rpc('incr', { p_key: key }));
  },
  async expire(key, seconds) {
    return (await rpc('expire', { p_key: key, p_seconds: Math.floor(seconds) })) ? 1 : 0;
  },
  async sadd(key, member) {
    return await rpc('sadd', { p_key: key, p_member: String(member) });
  },
  async srem(key, member) {
    return await rpc('srem', { p_key: key, p_member: String(member) });
  },
  async scard(key) {
    return Number(await rpc('scard', { p_key: key }));
  },
  async smembers(key) {
    return (await rpc('smembers', { p_key: key })) || [];
  },
};
