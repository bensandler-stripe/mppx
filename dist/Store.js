/**
 * Async key-value store interface.
 *
 * Modeled after Cloudflare KV's API (`get`/`put`/`delete`).
 * Implementations handle serialization internally.
 *
 * ## Type architecture
 *
 * Uses a two-slot generic pattern inspired by Viem's `Client` type:
 *
 * - `itemMap` — constrains keys and their value types
 * - `extended` — accumulates additional capabilities (e.g., atomic `update`)
 *
 * `AtomicStore` is a type alias that fills the `extended` slot with
 * `AtomicActions`, just like Viem's `PublicClient = Client<..., PublicActions>`.
 */
import { Json } from 'ox';
const keyPrefixCache = new WeakMap();
export function from(store, options) {
    return withKeyPrefix(store, options?.keyPrefix);
}
function withKeyPrefix(store, keyPrefix = '') {
    if (!keyPrefix)
        return store;
    const cached = keyPrefixCache.get(store)?.get(keyPrefix);
    if (cached)
        return cached;
    const backing = store;
    const prefixedKey = (key) => `${keyPrefix}${key}`;
    const prefixed = from({
        async get(key) {
            return backing.get(prefixedKey(key));
        },
        async put(key, value) {
            await backing.put(prefixedKey(key), value);
        },
        async delete(key) {
            await backing.delete(prefixedKey(key));
        },
        ...('update' in store
            ? {
                async update(key, fn) {
                    return store.update(prefixedKey(key), fn);
                },
            }
            : {}),
    });
    const cachedByPrefix = keyPrefixCache.get(store) ?? new Map();
    cachedByPrefix.set(keyPrefix, prefixed);
    keyPrefixCache.set(store, cachedByPrefix);
    return prefixed;
}
function wrapJsonUpdate(update) {
    if (!update)
        return {};
    return {
        async update(key, fn) {
            return update(key, (current) => {
                const parsed = current == null ? null : Json.parse(current);
                const change = fn(parsed);
                if (change.op !== 'set')
                    return change;
                return { ...change, value: Json.stringify(change.value) };
            });
        },
    };
}
export function cloudflare(kv, options) {
    return from({
        async get(key) {
            const raw = await kv.get(key);
            if (raw == null)
                return null;
            return Json.parse(raw);
        },
        async put(key, value) {
            await kv.put(key, Json.stringify(value));
        },
        async delete(key) {
            await kv.delete(key);
        },
        ...wrapJsonUpdate(kv.update),
    }, options);
}
/** In-memory store backed by a `Map`. JSON-roundtrips values to match production behavior. */
export function memory(options) {
    const store = new Map();
    return from({
        async get(key) {
            const raw = store.get(key);
            if (raw === undefined)
                return null;
            return Json.parse(raw);
        },
        async put(key, value) {
            store.set(key, Json.stringify(value));
        },
        async delete(key) {
            store.delete(key);
        },
        async update(key, fn) {
            const current = store.has(key) ? Json.parse(store.get(key)) : null;
            const change = fn(current);
            if (change.op === 'set')
                store.set(key, Json.stringify(change.value));
            if (change.op === 'delete')
                store.delete(key);
            return change.result;
        },
    }, options);
}
export function redis(client, options) {
    return from({
        async get(key) {
            const raw = await client.get(key);
            if (raw == null)
                return null;
            return Json.parse(raw);
        },
        async put(key, value) {
            await client.set(key, Json.stringify(value));
        },
        async delete(key) {
            await client.del(key);
        },
        ...wrapJsonUpdate(client.update),
    }, options);
}
export function upstash(redis, options) {
    return from({
        async get(key) {
            return (await redis.get(key));
        },
        async put(key, value) {
            await redis.set(key, value);
        },
        async delete(key) {
            await redis.del(key);
        },
        ...(redis.update
            ? {
                update: redis.update,
            }
            : {}),
    }, options);
}
//# sourceMappingURL=Store.js.map