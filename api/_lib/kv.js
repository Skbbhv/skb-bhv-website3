// api/_lib/kv.js
// Kleine koppeling met de Redis-database van Vercel (Storage → Redis), via REDIS_URL.
// Biedt dezelfde functies als @vercel/kv (get, set, del, incr, expire, sadd, smembers),
// zodat de rest van de code niet hoeft te veranderen. Waarden worden als JSON bewaard.
//
// Vereist environment variable: REDIS_URL (wordt automatisch gezet door de Redis-koppeling)

import { createClient } from 'redis';

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL ontbreekt: koppel de Redis-database aan dit project in Vercel.');
    const client = createClient({ url });
    client.on('error', (err) => console.error('Redis-fout:', err));
    clientPromise = client.connect().then(() => client).catch((err) => {
      clientPromise = null; // volgende aanroep probeert opnieuw
      throw err;
    });
  }
  return clientPromise;
}

function decode(raw) {
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

export const kv = {
  async get(key) {
    const c = await getClient();
    return decode(await c.get(key));
  },
  // options: { nx: true } alleen zetten als hij nog niet bestaat, { ex: seconden } verlooptijd
  async set(key, value, options = {}) {
    const c = await getClient();
    const opts = {};
    if (options.nx) opts.NX = true;
    if (options.ex) opts.EX = options.ex;
    return await c.set(key, JSON.stringify(value), opts); // 'OK' of null
  },
  async del(key) {
    const c = await getClient();
    return await c.del(key);
  },
  async incr(key) {
    const c = await getClient();
    return await c.incr(key);
  },
  async expire(key, seconds) {
    const c = await getClient();
    return await c.expire(key, seconds);
  },
  async sadd(key, member) {
    const c = await getClient();
    return await c.sAdd(key, String(member));
  },
  async smembers(key) {
    const c = await getClient();
    return await c.sMembers(key);
  },
};
