#!/usr/bin/env node
/**
 * Renders a scene transition to a transparent video for the OBS Stinger.
 *
 *   npm run render -- --username default [--server http://localhost:4050]
 *                     [--game gta] [--format webm|mov] [--orientation horizontal|vertical]
 *                     [--quality draft|looks|delivery]
 *
 * Output: ../storage/transitions/<username>-<game>.<format>, served by the
 * server at /media/transitions/<file>.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { renderTransition } from './render-lib.mjs';

const { values: args } = parseArgs({
  options: {
    username: { type: 'string', default: 'default' },
    server:   { type: 'string', default: 'http://localhost:4050' },
    game:     { type: 'string' },
    format:   { type: 'string', default: 'webm' },
    orientation: { type: 'string', default: 'horizontal' },
    quality:  { type: 'string', default: 'delivery' },
  },
});

const output = await renderTransition(args);
console.log(`\nDone: ${output}`);
console.log(`Network URL: ${args.server.replace(/\/$/, '')}/media/transitions/${path.basename(output)}`);
