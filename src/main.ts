import Phaser from 'phaser';
import { createGameConfig } from '@/config/gameConfig';
import { SCENES } from '@/config/constants';
import { installGlobalErrorHandlers, logger } from '@/utils/Logger';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { MainMenuScene } from '@/scenes/MainMenuScene';
import { LevelSelectScene } from '@/scenes/LevelSelectScene';
import { GameplayScene } from '@/scenes/GameplayScene';
import { PracticeScene } from '@/scenes/PracticeScene';
import { EditorScene } from '@/scenes/EditorScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { ProfileScene } from '@/scenes/ProfileScene';

/**
 * Application entry point.
 *
 * Responsibilities stop at wiring: create the Phaser game, hand it the scene
 * list, and make sure a failure here becomes a readable message rather than a
 * blank canvas. Everything else lives in a scene or a system.
 */

const ROOT_ID = 'game-root';
const SPLASH_ID = 'boot-splash';

function showFatal(title: string, detail: string): void {
  const splash = document.getElementById(SPLASH_ID);
  splash?.classList.add('is-hidden');

  const panel = document.createElement('div');
  panel.className = 'fatal';
  panel.innerHTML = `<h1></h1><p></p><pre></pre>`;
  const heading = panel.querySelector('h1');
  const message = panel.querySelector('p');
  const pre = panel.querySelector('pre');
  if (heading) heading.textContent = title;
  if (message) {
    message.textContent =
      'NEON DASH could not start. Reload the page; if this keeps happening the details below will say why.';
  }
  if (pre) pre.textContent = detail;
  document.body.appendChild(panel);
}

/** Removes the HTML splash once the first scene has something on screen. */
function dismissSplash(): void {
  const splash = document.getElementById(SPLASH_ID);
  if (!splash) return;
  splash.classList.add('is-hidden');
  window.setTimeout(() => splash.remove(), 400);
}

function start(): void {
  installGlobalErrorHandlers();

  const root = document.getElementById(ROOT_ID);
  if (!root) {
    showFatal('Missing mount point', `No element with id "${ROOT_ID}" was found in the page.`);
    return;
  }

  try {
    const game = new Phaser.Game({
      ...createGameConfig(root),
      scene: [
        BootScene,
        PreloadScene,
        MainMenuScene,
        LevelSelectScene,
        GameplayScene,
        PracticeScene,
        EditorScene,
        SettingsScene,
        ProfileScene,
      ],
    });

    // The menu is the first scene with real content, so that is when the HTML
    // splash has served its purpose.
    game.events.once(Phaser.Core.Events.READY, () => {
      logger.info('main', `Phaser ${Phaser.VERSION} ready, renderer ${game.renderer.type}`);
    });
    game.scene.getScene(SCENES.MAIN_MENU)?.events.once('create', dismissSplash);

    // Preload already ran long enough to be visible; drop the splash regardless
    // so a slow menu never leaves the loader stuck on screen.
    window.setTimeout(dismissSplash, 4000);

    // Exposed for the browser console and for end-to-end tests only.
    if (import.meta.env.DEV) {
      (window as unknown as { neonDash?: Phaser.Game }).neonDash = game;
    }
  } catch (error) {
    const detail =
      error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
    logger.error('main', 'Failed to create the Phaser game', error);
    showFatal('Startup failed', detail);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
