import path from "path";
import { CACHE_DIR, DATA_DIR, readJsonIfExists, writeJsonSync } from "./config.mjs";
import { fetchAllPrompts, probePromptsFeed } from "./youmind-client.mjs";

function getCachePath(locale) {
  return path.join(CACHE_DIR, `prompts.${locale}.json`);
}

function getFallbackCachePaths(locale) {
  return [...new Set([getCachePath(locale), path.join(DATA_DIR, `prompts.${locale}.json`)])];
}

function isUsableCache(payload, { locale, model }) {
  return (
    payload &&
    payload.locale === locale &&
    payload.model === model &&
    Array.isArray(payload.prompts)
  );
}

function getFetchedAtMs(payload) {
  const value = Date.parse(payload?.fetchedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function findBestCache({ locale, model }) {
  const matches = getFallbackCachePaths(locale)
    .map((cachePath) => ({
      cachePath,
      payload: readJsonIfExists(cachePath)
    }))
    .filter(({ payload }) => isUsableCache(payload, { locale, model }))
    .sort((left, right) => getFetchedAtMs(right.payload) - getFetchedAtMs(left.payload));

  if (matches.length === 0) {
    return null;
  }

  const best = matches[0];
  const fetchedAtMs = getFetchedAtMs(best.payload);

  return {
    ...best,
    fetchedAtMs,
    ageMs: fetchedAtMs > 0 ? Math.max(0, Date.now() - fetchedAtMs) : Number.POSITIVE_INFINITY
  };
}

function isFreshEnough(cache, maxCacheAgeHours) {
  if (!cache) {
    return false;
  }

  if (!Number.isFinite(maxCacheAgeHours)) {
    return true;
  }

  return cache.ageMs <= maxCacheAgeHours * 60 * 60 * 1000;
}

function toProbePrompt(prompt) {
  return {
    id: String(prompt?.id ?? ""),
    title: String(prompt?.title ?? ""),
    sourcePublishedAt: String(prompt?.sourcePublishedAt ?? ""),
    detailUrl: String(prompt?.detailUrl ?? ""),
    sourceLink: String(prompt?.sourceLink ?? "")
  };
}

function doesProbeMatchCache(cachePayload, probe) {
  if (
    !cachePayload ||
    Number(cachePayload.total || 0) !== Number(probe.total || 0) ||
    !Array.isArray(cachePayload.prompts) ||
    cachePayload.prompts.length < Number(probe.total || 0)
  ) {
    return false;
  }

  const cachedPrompts = cachePayload.prompts.slice(0, probe.prompts.length).map(toProbePrompt);
  return JSON.stringify(cachedPrompts) === JSON.stringify(probe.prompts);
}

export async function loadOrFetchPromptPayload({
  locale,
  model,
  onProgress,
  forceRefresh = false,
  preferCache = true,
  maxCacheAgeHours,
  allowStaleFallbackOnError = false,
  probeBeforeFetch = false
}) {
  const existingCache = findBestCache({ locale, model });
  const cachePath = getCachePath(locale);

  if (!forceRefresh && preferCache && isFreshEnough(existingCache, maxCacheAgeHours)) {
    return {
      source: "cache",
      cachePath: existingCache.cachePath,
      payload: existingCache.payload,
      cacheAgeMs: existingCache.ageMs
    };
  }

  try {
    if (!forceRefresh && probeBeforeFetch && existingCache) {
      const probe = await probePromptsFeed({ locale, model });

      if (doesProbeMatchCache(existingCache.payload, probe)) {
        return {
          source: "probe-cache",
          cachePath: existingCache.cachePath,
          payload: existingCache.payload,
          cacheAgeMs: existingCache.ageMs
        };
      }
    }

    const fetchedAt = new Date().toISOString();
    const result = await fetchAllPrompts({
      locale,
      model,
      onProgress
    });

    const payload = {
      fetchedAt,
      locale,
      model,
      total: result.total,
      totalPages: result.totalPages,
      prompts: result.prompts
    };

    writeJsonSync(cachePath, payload);

    return {
      source: "remote",
      cachePath,
      payload,
      cacheAgeMs: 0
    };
  } catch (error) {
    if (!allowStaleFallbackOnError || !existingCache) {
      throw error;
    }

    return {
      source: "stale-cache",
      cachePath: existingCache.cachePath,
      payload: existingCache.payload,
      cacheAgeMs: existingCache.ageMs,
      fetchError: error
    };
  }
}
