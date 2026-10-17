#!/usr/bin/env node
/**
 * Host render worker: keeps a connection to the server and renders the jobs
 * requested from the editor's "Descargar video" button.
 *
 *   npm run worker [-- --server http://localhost:4050]
 *
 * Runs on the host (not in Docker) because HyperFrames needs Node >= 22,
 * Chrome and FFmpeg. Leave it running while you stream / edit.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { renderTransition } from './render-lib.mjs';

const { values: args } = parseArgs({
  options: {
    server:  { type: 'string', default: process.env.RENDER_SERVER || 'http://localhost:4050' },
    quality: { type: 'string', default: 'delivery' },
  },
});

const server = args.server.replace(/\/$/, '');
const queue  = [];
let   busy   = false;

async function report(id, body) {
  try {
    await fetch(`${server}/api/scene-transition/render/${encodeURIComponent(id)}/status`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (err) {
    console.error(`  could not report job ${id}: ${err.message}`);
  }
}

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    console.log(`▶ job ${job.id}: @${job.username} (${job.orientation} ${job.format})`);
    await report(job.id, { status: 'rendering' });
    try {
      const output = await renderTransition({
        username: job.username,
        server,
        format:   job.format,
        orientation: job.orientation,
        quality:  args.quality,
        quiet:    true,
      });
      await report(job.id, { status: 'done', file: path.basename(output) });
      console.log(`✔ job ${job.id}: ${path.basename(output)}`);
    } catch (err) {
      await report(job.id, { status: 'error', error: err.message });
      console.error(`✖ job ${job.id}: ${err.message}`);
    }
  }
  busy = false;
}

/** Minimal SSE reader over fetch; resolves when the stream ends. */
async function listen() {
  const res = await fetch(`${server}/api/scene-transition/worker/stream`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) throw new Error(`stream → ${res.status}`);
  console.log(`● connected to ${server} — waiting for render jobs`);

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = event.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'job' && !queue.some((j) => j.id === msg.job.id)) {
          queue.push(msg.job);
          drain();
        }
      } catch {
        // ignore malformed event
      }
    }
  }
}

// Reconnect forever (the dev server restarts on file changes)
for (;;) {
  try {
    await listen();
    console.log('○ stream closed, reconnecting…');
  } catch (err) {
    console.log(`○ ${err.message} — retrying in 3s`);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
