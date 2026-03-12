#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'out');
const PORT = Number(process.env.FETCHER_PORT || 3100);
const INTERVAL_MIN = Number(process.env.SYNC_INTERVAL_MIN || 5);
const RESET_ON_START = process.env.SYNC_RESET_ON_START === '1';

const MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

let shuttingDown = false;
let syncProcess = null;
let syncState = {
  running: false,
  mode: 'idle',
  targetModels: null,
  startedAt: null,
  stoppedAt: null,
  lastExitCode: null,
  lastExitSignal: null,
  intervalMin: INTERVAL_MIN,
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function isUnderPublic(filePath) {
  const normalizedPublic = `${path.normalize(PUBLIC_DIR)}${path.sep}`;
  const normalizedFile = path.normalize(filePath);
  return normalizedFile === path.normalize(PUBLIC_DIR) || normalizedFile.startsWith(normalizedPublic);
}

function resolveRequestedFile(urlPathname) {
  if (urlPathname === '/models.json') {
    return path.join(PUBLIC_DIR, 'models.json');
  }

  if (
    !urlPathname.startsWith('/hf/') &&
    !urlPathname.startsWith('/model_metadata/')
  ) {
    return null;
  }

  const decoded = decodeURIComponent(urlPathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
  return isUnderPublic(filePath) ? filePath : null;
}

function writeJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function ensureDirectories() {
  await fsPromises.mkdir(PUBLIC_DIR, { recursive: true });
  await fsPromises.mkdir(OUT_DIR, { recursive: true });
  const modelsPath = path.join(PUBLIC_DIR, 'models.json');
  try {
    await fsPromises.access(modelsPath);
  } catch {
    await fsPromises.writeFile(modelsPath, '[]\n', 'utf8');
  }
}

function getStatusPayload() {
  return {
    ok: true,
    service: 'model-fetcher',
    running: syncState.running,
    mode: syncState.mode,
    targetModels: syncState.targetModels,
    startedAt: syncState.startedAt,
    stoppedAt: syncState.stoppedAt,
    lastExitCode: syncState.lastExitCode,
    lastExitSignal: syncState.lastExitSignal,
    intervalMin: syncState.intervalMin,
    updatedAt: new Date().toISOString(),
  };
}

function startSyncProcess(mode, targetModels = null) {
  const args = ['scripts/sync-models.mjs'];
  if (mode === 'continuous') {
    args.push('--loop', `--interval-min=${INTERVAL_MIN}`);
  } else if (mode === 'limited' && targetModels) {
    args.push(`--max-models=${targetModels}`);
  } else {
    throw new Error('Invalid sync start mode');
  }
  if (RESET_ON_START) args.push('--reset');

  const child = spawn('node', args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  syncProcess = child;
  syncState = {
    ...syncState,
    running: true,
    mode,
    targetModels,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    lastExitCode: null,
    lastExitSignal: null,
  };

  child.on('exit', (code, signal) => {
    syncProcess = null;
    syncState = {
      ...syncState,
      running: false,
      mode: 'idle',
      targetModels: null,
      stoppedAt: new Date().toISOString(),
      lastExitCode: code ?? null,
      lastExitSignal: signal ?? null,
    };

    if (shuttingDown) return;
    if (mode === 'continuous') {
      console.error(
        `[model-fetcher] sync daemon exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
      );
    } else {
      console.log(
        `[model-fetcher] limited sync finished (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
      );
    }
  });

  return child;
}

function stopSyncProcess(signal = 'SIGTERM') {
  if (!syncProcess) return false;
  syncState = {
    ...syncState,
    running: false,
    mode: 'idle',
    targetModels: null,
    stoppedAt: new Date().toISOString(),
  };
  syncProcess.kill(signal);
  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function createRequestHandler(req, res) {
  if (!req.url) {
    writeJson(res, 400, { error: 'Invalid request URL' });
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    writeJson(res, 400, { error: 'Malformed URL' });
    return;
  }

  if (pathname === '/health') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    writeJson(res, 200, getStatusPayload());
    return;
  }

  if (pathname === '/control/status') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    writeJson(res, 200, getStatusPayload());
    return;
  }

  if (pathname === '/control/start') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return;
    }
    if (syncProcess) {
      writeJson(res, 409, { error: 'Fetcher is already running', ...getStatusPayload() });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      writeJson(res, 400, { error: error.message });
      return;
    }

    const mode = body?.mode;
    const targetModels = Number(body?.targetModels);
    if (mode === 'continuous') {
      startSyncProcess('continuous');
      writeJson(res, 200, getStatusPayload());
      return;
    }
    if (mode === 'limited' && Number.isInteger(targetModels) && targetModels > 0) {
      startSyncProcess('limited', targetModels);
      writeJson(res, 200, getStatusPayload());
      return;
    }

    writeJson(res, 400, { error: 'Invalid start payload' });
    return;
  }

  if (pathname === '/control/stop') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return;
    }

    if (!syncProcess) {
      writeJson(res, 200, getStatusPayload());
      return;
    }

    stopSyncProcess();
    writeJson(res, 200, getStatusPayload());
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const filePath = resolveRequestedFile(pathname);
  if (!filePath) {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const stat = await fsPromises.stat(filePath);
    if (!stat.isFile()) {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    const headers = {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-cache',
    };

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        writeJson(res, 500, { error: 'Failed to read file' });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch {
    writeJson(res, 404, { error: 'Not found' });
  }
}

async function main() {
  await ensureDirectories();

  const server = http.createServer((req, res) => {
    createRequestHandler(req, res).catch((err) => {
      console.error('[model-fetcher] request failed:', err);
      writeJson(res, 500, { error: 'Internal server error' });
    });
  });

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[model-fetcher] received ${signal}, shutting down`);
    server.close(() => {
      stopSyncProcess('SIGTERM');
      process.exit(0);
    });

    setTimeout(() => {
      stopSyncProcess('SIGKILL');
      process.exit(1);
    }, 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(PORT, () => {
    console.log(`[model-fetcher] serving http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[model-fetcher] startup failed:', err);
  process.exit(1);
});
