// cyex.tv IDs for emotes, accounts and sets: decimal strings of 15 to 19 digits (Snowflakes,
// ADR 0027 in the platform repo), or the 26-character ULIDs they replaced, which the API still
// takes as input. Always strings: a Snowflake does not fit a JavaScript number.

export const SNOWFLAKE = /^[1-9]\d{14,18}$/;
export const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

export const isSnowflake = (s: unknown): s is string => typeof s === 'string' && SNOWFLAKE.test(s);
export const isUlid = (s: unknown): s is string => typeof s === 'string' && ULID.test(s);
/** Either form of a cyex.tv emote, account or set ID. */
export const isCyexId = (s: unknown): s is string => isSnowflake(s) || isUlid(s);
