#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const HF_BASE = 'https://huggingface.co';
const HF_MODELS_API = `${HF_BASE}/api/models`;
const BATCH_LIMIT = 250;
const CHECK_CONCURRENCY = 16;
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const HF_DIR = path.join(PUBLIC_DIR, 'hf');
const META_DIR = path.join(PUBLIC_DIR, 'model_metadata');
const MODELS_JSON_PATH = path.join(PUBLIC_DIR, 'models.json');
const STATE_PATH = path.join(ROOT, 'out', 'sync_state.json');

function getToken() {
  return process.env.HF_TOKEN || process.env.HF_API_KEY || '';
}

function headers() {
  const h = {};
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function encodeModelId(modelId) {
  return modelId
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function getNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>\s*;\s*rel="next"/i);
  if (!match?.[1]) return null;
  try {
    // Hugging Face can return absolute or relative pagination URLs.
    return new URL(match[1], HF_BASE).toString();
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`);
  return await res.json();
}

async function headOk(url) {
  const res = await fetch(url, {
    method: 'HEAD',
    headers: headers(),
    redirect: 'follow',
    cache: 'no-store',
  });
  return res.ok;
}

function hasChatTemplate(metaText) {
  return /"chat_template(?:_jinja)?"\s*:/i.test(metaText);
}

async function validateAndDownloadModel(modelId, metadata) {
  const encoded = encodeModelId(modelId);
  const baseResolve = `${HF_BASE}/${encoded}/resolve/main`;

  const [tokOk, confOk] = await Promise.all([
    headOk(`${baseResolve}/tokenizer.json`),
    headOk(`${baseResolve}/tokenizer_config.json`),
  ]);
  if (!tokOk || !confOk) return false;

  const metaText = JSON.stringify(metadata);
  if (!hasChatTemplate(metaText)) return false;

  const [tokenizerRes, tokenizerConfigRes] = await Promise.all([
    fetch(`${baseResolve}/tokenizer.json`, { headers: headers(), cache: 'no-store' }),
    fetch(`${baseResolve}/tokenizer_config.json`, { headers: headers(), cache: 'no-store' }),
  ]);
  if (!tokenizerRes.ok || !tokenizerConfigRes.ok) return false;

  const [tokenizerJson, tokenizerConfigJson] = await Promise.all([
    tokenizerRes.json(),
    tokenizerConfigRes.json(),
  ]);

  const modelHfDir = path.join(HF_DIR, modelId);
  const modelMetaDir = path.join(META_DIR, modelId);
  await ensureDir(modelHfDir);
  await ensureDir(modelMetaDir);

  await Promise.all([
    writeJson(path.join(modelHfDir, 'tokenizer.json'), tokenizerJson),
    writeJson(path.join(modelHfDir, 'tokenizer_config.json'), tokenizerConfigJson),
    writeJson(path.join(modelMetaDir, 'metadata.json'), metadata),
  ]);

  return true;
}

async function localModelArtifactsExist(modelId) {
  const modelHfDir = path.join(HF_DIR, modelId);
  const modelMetaDir = path.join(META_DIR, modelId);
  try {
    await Promise.all([
      fs.access(path.join(modelHfDir, 'tokenizer.json')),
      fs.access(path.join(modelHfDir, 'tokenizer_config.json')),
      fs.access(path.join(modelMetaDir, 'metadata.json')),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function processWithConcurrency(items, concurrency, handler) {
  let index = 0;
  const out = [];

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      const result = await handler(items[i], i);
      out[i] = result;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return out;
}

function readNumericArg(prefix, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function runSingleBatch() {
  const reset = process.argv.includes('--reset');
  const startupMode = process.argv.includes('--startup');
  const state = reset
    ? { nextCursor: null, run: 0 }
    : await readJson(STATE_PATH, { nextCursor: null, run: 0 });

  let startUrl = `${HF_MODELS_API}?sort=downloads&direction=-1&limit=${BATCH_LIMIT}`;
  if (state.nextCursor) {
    try {
      startUrl = new URL(state.nextCursor, HF_BASE).toString();
    } catch {
      console.warn('[sync-models] invalid saved cursor, restarting from first page');
    }
  }

  console.log(`[sync-models] run #${(state.run || 0) + 1} starting batch from: ${startUrl}`);
  const res = await fetch(startUrl, { headers: headers(), cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch model page: ${res.status}`);
  }

  const nextCursor = getNextLink(res.headers.get('link'));
  const list = await res.json();
  const ids = Array.isArray(list)
    ? list
        .map(item => item?.modelId || item?.id)
        .filter(id => typeof id === 'string' && id.includes('/'))
    : [];

  console.log(`[sync-models] candidates in batch: ${ids.length}`);
  const uniqueIds = Array.from(new Set(ids));
  console.log(`[sync-models] unique models fetched: ${uniqueIds.length}`);
  console.log(
    `[sync-models] sample fetched (up to 5): ${
      uniqueIds.slice(0, 5).join(', ') || 'none'
    }`
  );
  const existingModels = await readJson(MODELS_JSON_PATH, []);
  const existingSet = new Set(Array.isArray(existingModels) ? existingModels : []);

  // Keep startup fast by preferring local verification before any network checks.
  const existingVerified = await processWithConcurrency(
    uniqueIds.filter(id => existingSet.has(id)),
    CHECK_CONCURRENCY,
    async (modelId) => (await localModelArtifactsExist(modelId) ? modelId : null)
  );
  const existingValidIds = existingVerified.filter(Boolean);
  const existingValidSet = new Set(existingValidIds);

  const pendingIds = uniqueIds.filter(id => !existingValidSet.has(id));
  let failedCount = 0;

  const validated = await processWithConcurrency(pendingIds, CHECK_CONCURRENCY, async (modelId) => {
    try {
      if (await localModelArtifactsExist(modelId)) {
        return modelId;
      }
      const metadata = await fetchJson(`${HF_MODELS_API}/${encodeModelId(modelId)}`);
      const ok = await validateAndDownloadModel(modelId, metadata);
      return ok ? modelId : null;
    } catch (err) {
      failedCount += 1;
      console.warn(
        `[sync-models] failed model ${modelId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  const validIds = [...existingValidIds, ...validated.filter(Boolean)];
  console.log(
    `[sync-models] sample valid (up to 5): ${
      validIds.slice(0, 5).join(', ') || 'none'
    }`
  );
  const merged = Array.from(new Set([...(Array.isArray(existingModels) ? existingModels : []), ...validIds]))
    .sort((a, b) => a.localeCompare(b));
  await writeJson(MODELS_JSON_PATH, merged);

  await writeJson(STATE_PATH, {
    nextCursor: nextCursor || null,
    run: (state.run || 0) + 1,
    lastBatchSize: uniqueIds.length,
    addedValidModels: validIds.length,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[sync-models] added valid models: ${validIds.length}`);
  console.log(`[sync-models] failed validations/downloads this batch: ${failedCount}`);
  console.log(`[sync-models] total models in public/models.json: ${merged.length}`);
  console.log(`[sync-models] next cursor saved: ${nextCursor || 'none (end reached)'}`);
  if (startupMode) {
    console.log('[sync-models] startup mode complete');
  }
}

async function main() {
  const loopMode = process.argv.includes('--loop');
  const intervalMinutes = readNumericArg('--interval-min=', 15);
  const intervalMs = intervalMinutes * 60 * 1000;

  if (!loopMode) {
    await runSingleBatch();
    return;
  }

  console.log(`[sync-models] daemon mode enabled, interval: ${intervalMinutes} min`);
  while (true) {
    try {
      await runSingleBatch();
    } catch (err) {
      console.error('[sync-models] daemon iteration failed:', err.message);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

main().catch((err) => {
  console.error('[sync-models] failed:', err.message);
  process.exit(1);
});
