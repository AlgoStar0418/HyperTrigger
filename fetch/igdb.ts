import { readCache, writeCache } from "./cache";
import type { Config } from "../../hypetrigger-app/src/configs";
import cleanConfigTitle from "../util/cleanConfigTitle";

export const IGDB_CACHE_DIR = "cache/igdb";

export type TwitchBearerToken = {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";

  /** Doesn't come from original API response; appended after fetch with `new Date().getTime()` */
  generated_at?: number;
};

export type IGDBImage = {
  id: number;
  height: number;
  width: number;
  image_id: string;
};

export type IGDBGameInfo = {
  id: number;
  cover: IGDBImage;
  first_release_date: number;
  name: string;
  screenshots: IGDBImage[];
};

export async function fetchAccessToken(): Promise<TwitchBearerToken> {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });
  const url = `https://id.twitch.tv/oauth2/token?${params.toString()}`;
  const response = await fetch(url, { method: "POST" });
  const json = (await response.json()) as TwitchBearerToken;
  json.generated_at = new Date().getTime();
  console.log(`[igdb] Fetched new access token = ${json.access_token}`);
  return json;
}

export async function getAccessToken(): Promise<TwitchBearerToken> {
  const path = `${IGDB_CACHE_DIR}/access_token.json`;
  const cached = readCache<TwitchBearerToken>(path);

  const cacheExists = cached !== undefined;
  const expired =
    cacheExists &&
    (!cached.generated_at ||
      cached.generated_at + cached.expires_in < new Date().getTime());
  if (expired) console.warn("[igdb] Access token expired");
  if (cacheExists && !expired) return cached;

  const token = (await fetchAccessToken()) as TwitchBearerToken;
  writeCache(path, token);
  return token;
}

export async function getGameInfo(
  config: Config
): Promise<IGDBGameInfo | undefined> {
  const path = `${IGDB_CACHE_DIR}/igdb-${config.id}.json`;
  const cached = readCache<IGDBGameInfo>(path);
  if (cached) return cached;

  const token = await getAccessToken();

  const fresh = await fetchGameInfo(config, token);
  if (fresh) writeCache(path, fresh);
  else console.error(`[igdb] Empty response returned for ${config.title}`);
  return fresh;
}

export async function fetchGameInfo(
  config: Config,
  token: TwitchBearerToken
): Promise<IGDBGameInfo | undefined> {
  const searchName = cleanConfigTitle(config.title);

  const result = await fetch("https://api.igdb.com/v4/games/", {
    method: "POST",
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${token.access_token}`,
    },
    body: `
      fields
        name,
        first_release_date,
        screenshots.image_id,
        screenshots.width,
        screenshots.height,
        cover.image_id,
        cover.width,
        cover.height;
      limit 1;
      where ${
        config.igdbGameId
          ? `id = ${config.igdbGameId};`
          : `name ~ "${searchName}";`
      }
    `,
  });
  const json = await result.json();
  if (json.length === 0) return undefined;
  return json[0] as IGDBGameInfo;
}
