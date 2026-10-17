/**
 * Shared render logic for the CLI (render-transition.mjs) and the worker
 * (render-worker.mjs). Reads saved settings (and logo) from the running server,
 * builds a HyperFrames project from the same files the live overlay uses and
 * renders it to a transparent video.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE    = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(HERE, '..');
export const OUT_DIR = path.join(ROOT, 'storage', 'transitions');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

function run(cmd, cmdArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd, stdio: 'inherit', env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1' } });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

/**
 * Renders the saved transition of `username` and returns the output path.
 * Writes ../storage/transitions/<username>-<game>.<format>.
 */
export async function renderTransition({ username, server, game: gameOverride, format = 'webm', orientation = 'horizontal', quality = 'delivery', quiet = false }) {
  if (!['webm', 'mov'].includes(format)) {
    throw new Error('format must be webm or mov (both keep transparency)');
  }
  const vertical = orientation === 'vertical';
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  username = String(username || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
  server   = String(server || 'http://localhost:4050').replace(/\/$/, '');

  const settings = await fetchJson(`${server}/api/scene-transition?username=${encodeURIComponent(username)}`);
  const game     = gameOverride || settings.game || 'default';
  if (!/^[a-z0-9-]+$/.test(game)) throw new Error(`Invalid game "${game}"`);

  // The game module declares its own length; read it so the composition matches.
  const gameJs   = await readFile(path.join(ROOT, 'widgets/scene-transition/games', `${game}.js`), 'utf8');
  const duration = Number(/var DURATION\s*=\s*([\d.]+)/.exec(gameJs)?.[1]);
  if (!duration) throw new Error(`games/${game}.js must declare "var DURATION = <seconds>;"`);

  const name    = `${username}-${game}${vertical ? '-vertical' : ''}`;
  const project = path.join(HERE, '.render', name);
  await rm(project, { recursive: true, force: true });
  await mkdir(project, { recursive: true });

  // Same relative layout as the server so the CSS font URLs resolve unchanged
  await cp(path.join(ROOT, 'widgets/shared'), path.join(project, 'widgets/shared'), { recursive: true });
  await cp(path.join(ROOT, 'widgets/scene-transition/games'), path.join(project, 'widgets/scene-transition/games'), { recursive: true });
  await cp(path.join(ROOT, 'assets/fonts'), path.join(project, 'assets/fonts'), { recursive: true });
  // Sound: the style's mix, the user's uploaded clip, or none
  const soundMode = settings.soundMode || 'style';
  let sfxFile = '';
  await mkdir(path.join(project, 'assets/sounds'), { recursive: true });
  if (soundMode === 'custom' && settings.soundFile) {
    const res = await fetch(`${server}/api/scene-transition/sound/${encodeURIComponent(username)}`);
    if (res.ok) {
      sfxFile = 'assets/sounds/sfx' + path.extname(settings.soundFile);
      await writeFile(path.join(project, sfxFile), Buffer.from(await res.arrayBuffer()));
    }
  }
  if (!sfxFile && soundMode !== 'off') {
    sfxFile = 'assets/sounds/sfx.mp3';
    await cp(path.join(ROOT, 'assets/sounds/transitions', `${game}.mp3`), path.join(project, sfxFile));
  }

  let logoUrl = '';
  if (settings.logoMode === 'image' && settings.logoFile) {
    const res = await fetch(`${server}/api/scene-transition/logo/${encodeURIComponent(username)}`);
    if (res.ok) {
      logoUrl = 'logo' + path.extname(settings.logoFile);
      await writeFile(path.join(project, logoUrl), Buffer.from(await res.arrayBuffer()));
    }
  }

  const vars = {
    logoMode: settings.logoMode,
    line1:    settings.line1 || '',
    line2:    settings.line2 || '',
    accent:   settings.accent,
    orientation: vertical ? 'vertical' : 'horizontal',
    logoUrl,
  };

  await writeFile(path.join(project, 'hyperframes.json'), JSON.stringify({ paths: { assets: 'assets' } }, null, 2));
  await writeFile(path.join(project, 'index.html'), `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${W}, height=${H}" />
  <link rel="stylesheet" href="widgets/shared/game-fonts.css" />
  <link rel="stylesheet" href="widgets/scene-transition/games/${game}.css" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script src="widgets/scene-transition/games/${game}.js"></script>
  <style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: transparent; }
    #root, #stage { position: relative; width: ${W}px; height: ${H}px; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${W}" data-height="${H}">
    <div id="stage" class="clip" data-start="0" data-duration="${duration}" data-track-index="0"></div>
    ${sfxFile ? `<audio id="sfx" src="${sfxFile}" data-start="0" data-duration="${duration}" data-track-index="1" data-has-audio="true"></audio>` : ''}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = window.SceneTransitions[${JSON.stringify(game)}]
      .mount(document.getElementById("stage"), ${JSON.stringify(vars)});
  </script>
</body>
</html>
`);

  await mkdir(OUT_DIR, { recursive: true });
  const output = path.join(OUT_DIR, `${name}.${format}`);

  console.log(`Rendering ${game} transition for @${username} → ${path.relative(ROOT, output)}`);
  await run('npx', ['hyperframes', 'render', project, '--format', format, '--quality', quality, '--fps', '60', '-o', output, ...(quiet ? ['--quiet'] : [])], HERE);
  await rm(project, { recursive: true, force: true });
  return output;
}
