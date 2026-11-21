// cyex.tv moved emotes, accounts and sets from ULIDs to Snowflakes (platform ADR 0027): IDs are
// opaque digit strings, old stored ULIDs are moved over once the API answers, and backups with
// either form load.
import { describe, expect, it } from 'vitest';
import { HiddenEmotesStore, readHidden } from '../src/features/cleanup/hide-emote';
import { Store } from '../src/features/composer/store';
import { SNOWFLAKE, isCyexId, isSnowflake, isUlid } from '../src/ids';
import { GONE_KEY, LOOKUP_CAP, migrateEmoteIds } from '../src/migrate-ids';
import { backupFile, readBackup } from '../src/options/model';
import { API, cyextv } from '../src/providers/cyextv';
import { DEFAULTS } from '../src/settings';
import { CYEX_CHANNEL, CYEX_SET, table } from './fixtures';

const ULID_A = '01JD8X3Q5ZABCDEFGHJKMNPQRS';
const ULID_B = '01JD8X3Q5ZTTTTTTTTTTTTTTTT';
const SNOW_A = '1314628736410763264';
const SNOW_B = '1314628736410763265';

const memory = () => {
  const data: Record<string, unknown> = {};
  const area: ExtStorageArea = {
    get: async (k) => {
      if (k == null) return { ...data };
      const keys = typeof k === 'string' ? [k] : k;
      return Object.fromEntries(keys.filter((x) => x in data).map((x) => [x, data[x]]));
    },
    set: async (o) => void Object.assign(data, o),
  };
  return { data, area };
};

const emoteAnswers = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([u, s]) => [`${API}/emotes/${u}`, { id: s, name: 'x' }]));

describe('id shapes', () => {
  it('accepts Snowflakes and ULIDs as strings', () => {
    expect(isSnowflake(SNOW_A)).toBe(true);
    expect(isSnowflake('9223372036854775807')).toBe(true);
    expect(isSnowflake(1314628736410763264)).toBe(false);
    expect(isSnowflake('0123456789012345')).toBe(false);
    expect(isSnowflake('12345')).toBe(false);
    expect(SNOWFLAKE.test('12345678901234567890')).toBe(false);
    expect(isUlid(ULID_A)).toBe(true);
    expect(isCyexId(ULID_A) && isCyexId(SNOW_A)).toBe(true);
    expect(isCyexId('S1')).toBe(false);
  });

  it('keeps Snowflakes whole through the provider (no Number)', async () => {
    const big = '1314628736410763299';
    const set = { ...CYEX_SET, id: SNOW_A, emotes: [{ ...CYEX_SET.emotes[0]!, emote: { ...CYEX_SET.emotes[0]!.emote, id: big } }] };
    const { fetch } = table({ [`${API}/channels/twitch/141981764`]: { ...CYEX_CHANNEL, active_set_id: SNOW_A }, [`${API}/sets/${SNOW_A}`]: set });
    const got = await cyextv.channel(fetch, 'twitch', '141981764');
    expect(got.setId).toBe(SNOW_A);
    expect(got.emotes[0]!.id).toBe(big);
  });

  it('hidden emotes and backups take both forms', () => {
    const list = [
      { provider: 'cyextv', id: ULID_A, name: 'a', url: '' },
      { provider: 'cyextv', id: SNOW_A, name: 'b', url: '' },
    ];
    expect(readHidden(list)).toHaveLength(2);
    const file = backupFile(DEFAULTS, {}, new Date(), readHidden(list));
    const back = readBackup(file.text);
    expect(back.ok && back.hidden?.map((h) => h.id)).toEqual([ULID_A, SNOW_A]);
  });
});

describe('Store.remapIds', () => {
  it('moves favourites and merges counts', async () => {
    const { data, area } = memory();
    data.emoteFavorites = [`cyextv:${ULID_A}`, '7tv:x', `cyextv:${SNOW_A}`];
    data.emoteUsage = { [`cyextv:${ULID_A}`]: 3, [`cyextv:${SNOW_A}`]: 2, '7tv:x': 1 };
    const s = new Store(area);
    await s.ready;
    await s.remapIds(new Map([[ULID_A, SNOW_A]]));
    expect(s.favorites).toEqual([`cyextv:${SNOW_A}`, '7tv:x']);
    expect(s.usage).toEqual({ [`cyextv:${SNOW_A}`]: 5, '7tv:x': 1 });
    expect(data.emoteFavorites).toEqual(s.favorites);
    expect(data.emoteUsage).toEqual(s.usage);
  });
});

describe('migrateEmoteIds', () => {
  const setup = async () => {
    const { data, area } = memory();
    data.emoteFavorites = [`cyextv:${ULID_A}`, '7tv:x'];
    data.emoteUsage = { [`cyextv:${ULID_A}`]: 3, [`cyextv:${ULID_B}`]: 4 };
    data.hiddenEmotes = [{ provider: 'cyextv', id: ULID_B, name: 'b', url: '' }];
    const store = new Store(area);
    const hidden = new HiddenEmotesStore();
    await hidden.load(area);
    return { data, area, store, hidden };
  };

  it('moves favourites, counts and hidden emotes, then does nothing more', async () => {
    const { data, area, store, hidden } = await setup();
    const t = table(emoteAnswers({ [ULID_A]: SNOW_A, [ULID_B]: SNOW_B }));
    const r = await migrateEmoteIds(area, t.fetch, store, hidden);
    expect(r).toEqual({ found: 2, moved: 2, pending: 0 });
    expect(data.emoteFavorites).toEqual([`cyextv:${SNOW_A}`, '7tv:x']);
    expect(data.emoteUsage).toEqual({ [`cyextv:${SNOW_A}`]: 3, [`cyextv:${SNOW_B}`]: 4 });
    expect((data.hiddenEmotes as { id: string }[])[0]!.id).toBe(SNOW_B);
    const again = await migrateEmoteIds(area, t.fetch, store, hidden);
    expect(again).toEqual({ found: 0, moved: 0, pending: 0 });
    expect(t.calls).toHaveLength(2);
  });

  it('loses nothing while the API is down and finishes later', async () => {
    const { data, area, store, hidden } = await setup();
    const down = async (): Promise<never> => {
      throw new Error('offline');
    };
    const r = await migrateEmoteIds(area, down, store, hidden);
    expect(r).toEqual({ found: 2, moved: 0, pending: 2 });
    expect(data.emoteFavorites).toEqual([`cyextv:${ULID_A}`, '7tv:x']);
    expect(data.emoteUsage).toEqual({ [`cyextv:${ULID_A}`]: 3, [`cyextv:${ULID_B}`]: 4 });
    // Garbage answers count as not resolved too.
    const odd = table({ [`${API}/emotes/${ULID_A}`]: { id: "nope" }, [`${API}/emotes/${ULID_B}`]: {} });
    expect((await migrateEmoteIds(area, odd.fetch, store, hidden)).moved).toBe(0);
    const ok = table(emoteAnswers({ [ULID_A]: SNOW_A, [ULID_B]: SNOW_B }));
    expect((await migrateEmoteIds(area, ok.fetch, store, hidden)).moved).toBe(2);
    expect(data.emoteFavorites).toEqual([`cyextv:${SNOW_A}`, '7tv:x']);
  });

  it('moves what it can when only some lookups work, and remembers emotes that are gone', async () => {
    const { data, area, store, hidden } = await setup();
    const t = table(emoteAnswers({ [ULID_A]: SNOW_A }));
    const r = await migrateEmoteIds(area, t.fetch, store, hidden);
    expect(r).toEqual({ found: 2, moved: 1, pending: 0 });
    expect(data.emoteUsage).toEqual({ [`cyextv:${SNOW_A}`]: 3, [`cyextv:${ULID_B}`]: 4 });
    expect(data[GONE_KEY]).toEqual([ULID_B]);
    const before = t.calls.length;
    await migrateEmoteIds(area, t.fetch, store, hidden);
    expect(t.calls).toHaveLength(before);
  });

  it('caps lookups per run', async () => {
    const { data, area } = memory();
    const ids = Array.from({ length: LOOKUP_CAP + 5 }, (_, i) => `01JD8X3Q5Z${String(i).padStart(16, '0')}`);
    data.emoteFavorites = ids.map((u) => `cyextv:${u}`);
    const store = new Store(area);
    const t = table(emoteAnswers(Object.fromEntries(ids.map((u, i) => [u, `13146287364107${String(60000 + i)}`]))));
    const r = await migrateEmoteIds(area, t.fetch, store, new HiddenEmotesStore());
    expect(r.moved).toBe(LOOKUP_CAP);
    expect(r.pending).toBe(5);
  });

  it('does nothing without storage', async () => {
    expect(await migrateEmoteIds(null, table({}).fetch, new Store(null), new HiddenEmotesStore())).toEqual({ found: 0, moved: 0, pending: 0 });
  });
});
