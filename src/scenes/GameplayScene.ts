import Phaser from 'phaser';
import { audioManager } from '@/audio/AudioManager';
import { AudioSyncManager } from '@/audio/AudioSyncManager';
import { CameraController } from '@/camera/CameraController';
import { DEPTH, PALETTE, PRACTICE, SCENES, SIM, VIEW } from '@/config/constants';
import { NeonBackground } from '@/effects/NeonBackground';
import { ParticleManager } from '@/effects/ParticleManager';
import { levelManager } from '@/levels/LevelManager';
import { levelObjectFactory } from '@/levels/LevelObjectFactory';
import type { Obstacle } from '@/obstacles/Obstacle';
import { CollisionWorld } from '@/player/CollisionWorld';
import { Player } from '@/player/Player';
import { PlayerController } from '@/player/PlayerController';
import { PlayerVisual } from '@/player/PlayerVisual';
import { clonePlayerState } from '@/player/PlayerState';
import type { SaveManager } from '@/save/SaveManager';
import { TriggerRuntime } from '@/triggers/TriggerRuntime';
import type { SceneEffects } from '@/triggers/Trigger';
import type { Checkpoint } from '@/types/PlayerTypes';
import type { LevelData } from '@/types/LevelTypes';
import { FixedStepAccumulator } from '@/utils/TimeUtils';
import { logger } from '@/utils/Logger';
import { parseHexColor } from '@/utils/MathUtils';
import { GameplayHud } from '@/ui/GameplayHud';

/** What the scene is started with. */
export interface GameplaySceneData {
  levelId: string;
  /** Practice mode enables checkpoints and does not count toward best progress. */
  practice?: boolean;
}

/**
 * Plays a level.
 *
 * The scene's own job is small and worth stating plainly: own the frame loop,
 * drive the fixed-step simulation from it, and connect the systems that do the
 * real work — player, triggers, camera, audio, effects, HUD. It contains no
 * physics, no collision arithmetic and no game-mode logic, all of which live in
 * their own units and are tested without a scene.
 */
export class GameplayScene extends Phaser.Scene {
  private save!: SaveManager;
  private level!: LevelData;
  private practice = false;

  private world!: CollisionWorld;
  private player!: Player;
  private controller!: PlayerController;
  private visual!: PlayerVisual;
  private triggers!: TriggerRuntime;
  private cameraController!: CameraController;
  private particles!: ParticleManager;
  private background!: NeonBackground;
  private sync!: AudioSyncManager;
  private hud!: GameplayHud;

  private readonly stepper = new FixedStepAccumulator();

  /** Views keyed by obstacle id, so triggers can retint and move them. */
  private readonly views = new Map<string, Phaser.GameObjects.GameObject>();
  private obstacles: Obstacle[] = [];

  /** Level bounds in world x, used for the progress calculation. */
  private startX = 0;
  private finishX = 1;

  private attempts = 0;
  private attemptTime = 0;
  private bestProgressThisSession = 0;
  private paused = false;
  private ended = false;

  private readonly checkpoints: Checkpoint[] = [];
  private timeSinceAutoCheckpoint = 0;

  private groundGraphics!: Phaser.GameObjects.Graphics;
  private flashRect!: Phaser.GameObjects.Rectangle;

  /** `key` lets PracticeScene register the same behaviour under its own key. */
  constructor(key: string = SCENES.GAMEPLAY) {
    super({ key });
  }

  init(data: GameplaySceneData): void {
    this.practice = data.practice ?? false;
    this.attempts = 0;
    this.ended = false;
    this.paused = false;
    this.checkpoints.length = 0;
    this.views.clear();
  }

  create(data: GameplaySceneData): void {
    this.save = this.registry.get('save') as SaveManager;

    void this.boot(data.levelId);
  }

  /** Async because the level body may still need fetching. */
  private async boot(levelId: string): Promise<void> {
    const level = await levelManager.load(levelId);

    if (!level) {
      this.showLoadFailure(levelId);
      return;
    }

    this.level = level;
    this.buildWorld();
    this.buildPresentation();
    this.buildSystems();
    this.startAttempt(true);
  }

  private showLoadFailure(levelId: string): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);
    this.add
      .text(VIEW.WIDTH / 2, VIEW.HEIGHT / 2 - 20, 'LEVEL COULD NOT BE LOADED', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '26px',
        fontStyle: '700',
        color: '#ff5c5c',
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW.WIDTH / 2, VIEW.HEIGHT / 2 + 18, `"${levelId}"  -  press ESC to go back`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '15px',
        color: '#6b7394',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SCENES.LEVEL_SELECT));
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start(SCENES.LEVEL_SELECT));
  }

  // ---------- Construction ----------

  private buildWorld(): void {
    this.world = new CollisionWorld();
    this.obstacles = levelObjectFactory.createAll(this.level.objects);
    this.world.addAll(this.obstacles);

    this.startX = this.level.startX;
    const finish = this.obstacles.find((obstacle) => obstacle.type === 'finish');
    // Without a finish object the level ends with the song, so fall back to the
    // distance the player will have covered by then.
    this.finishX = finish ? finish.x : this.startX + this.level.duration * 480;

    logger.info(
      'GameplayScene',
      `Loaded "${this.level.name}" - ${this.obstacles.length} objects, ${this.level.triggers.length} triggers`,
    );
  }

  private buildPresentation(): void {
    const theme = this.level.theme;
    const background = parseHexColor(theme.background) ?? PALETTE.BG_GLOW;
    const glow = parseHexColor(theme.glow) ?? PALETTE.VIOLET;

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);

    this.background = new NeonBackground(this, {
      top: background,
      bottom: PALETTE.BG_DEEP,
      accent: glow,
      pattern: theme.pattern ?? 'grid',
      motion: this.save.settings.reducedMotion ? 0.25 : 1,
      seed: this.level.id.length * 7919,
    });

    this.groundGraphics = this.add.graphics().setDepth(DEPTH.GROUND);
    this.drawGround();

    for (const obstacle of this.obstacles) {
      if (obstacle.type === 'decor') continue;
      const view = levelObjectFactory.createView(this, obstacle);
      this.views.set(obstacle.id, view);
    }

    this.particles = new ParticleManager(this, this.save.settings.quality === 'low' ? 160 : 420);
    this.particles.setDensity(
      this.save.settings.quality === 'low'
        ? 0.4
        : this.save.settings.quality === 'medium'
          ? 0.7
          : 1,
    );

    this.visual = new PlayerVisual(this, this.save.current.inventory.equipped);
    this.visual.setShowHitbox(this.save.settings.showHitboxes);

    // A full-screen rectangle used for colour flashes; cheaper and more
    // controllable than the camera's own flash effect.
    this.flashRect = this.add
      .rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, 0xffffff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.FOREGROUND)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /**
   * Draws the floor and ceiling as one wide strip.
   *
   * The level is far wider than the screen, so the strip is drawn once at full
   * length rather than being rebuilt as the camera moves; a few thousand pixels
   * of filled rectangle costs nothing and removes a per-frame redraw.
   */
  private drawGround(): void {
    const g = this.groundGraphics;
    const theme = this.level.theme;
    const groundColor = parseHexColor(theme.ground) ?? PALETTE.BG_MID;
    const glow = parseHexColor(theme.glow) ?? PALETTE.VIOLET;

    const left = this.startX - VIEW.WIDTH;
    const width = this.finishX - left + VIEW.WIDTH * 2;

    g.clear();

    g.fillStyle(groundColor, 1);
    g.fillRect(left, this.level.groundY, width, 2400);
    g.lineStyle(3, glow, 0.95);
    g.lineBetween(left, this.level.groundY, left + width, this.level.groundY);

    g.fillStyle(groundColor, 1);
    g.fillRect(left, this.level.ceilingY - 2400, width, 2400);
    g.lineStyle(3, glow, 0.6);
    g.lineBetween(left, this.level.ceilingY, left + width, this.level.ceilingY);
  }

  private buildSystems(): void {
    this.controller = new PlayerController(this);

    this.player = new Player({
      spawn: {
        x: this.level.startX,
        y: this.level.startY,
        mode: this.level.startMode,
        speed: this.level.startSpeed,
        gravity: this.level.startGravity,
      },
      groundY: this.level.groundY,
      ceilingY: this.level.ceilingY,
      world: this.world,
    });

    this.cameraController = new CameraController(this.cameras.main);
    this.cameraController.setShakeScale(this.save.settings.screenShake);

    this.triggers = new TriggerRuntime(this.createSceneEffects());
    this.triggers.load(this.level.triggers, this.obstacles);

    this.sync = new AudioSyncManager(audioManager);
    this.sync.prepare(
      this.level.song,
      this.level.bpm,
      this.level.duration,
      this.save.settings.audioOffsetMs,
    );

    this.hud = new GameplayHud(this, {
      levelName: this.level.name,
      practice: this.practice,
      showFps: this.save.settings.showFps,
      onPause: () => this.togglePause(),
    });

    this.wirePlayerEvents();
    this.wireBeatEvents();
    this.wireKeyboard();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  /** The bridge triggers use to reach the scene's own capabilities. */
  private createSceneEffects(): SceneEffects {
    return {
      shake: (intensity, duration) => this.cameraController.shake(intensity, duration),
      flash: (color, duration) => this.flash(color, duration),
      zoom: (zoom, duration, easing) => this.cameraController.zoomTo(zoom, duration, easing),
      pan: (x, y, duration, easing) => this.cameraController.panTo(x, y, duration, easing),
      rotate: (degrees, duration, easing) =>
        this.cameraController.rotateTo(degrees, duration, easing),
      setVisual: (id, alpha, tint) => {
        const view = this.views.get(id) as
          | (Phaser.GameObjects.GameObject & {
              setAlpha?: (a: number) => void;
              setTint?: (t: number) => void;
            })
          | undefined;
        if (!view) return;
        if (alpha !== undefined) view.setAlpha?.(alpha);
        if (tint !== undefined) view.setTint?.(tint);
      },
      setEnabled: (id, enabled) => {
        const view = this.views.get(id) as
          (Phaser.GameObjects.GameObject & { setVisible?: (v: boolean) => void }) | undefined;
        view?.setVisible?.(enabled);
      },
      spawnParticles: (x, y, color, count) => this.particles.burst(x, y, { color, count }),
    };
  }

  private wirePlayerEvents(): void {
    const colors = this.save.current.inventory.equipped;
    const primary = parseHexColor(colors.primaryColor) ?? PALETTE.CYAN;
    const secondary = parseHexColor(colors.secondaryColor) ?? PALETTE.MAGENTA;

    this.player.events.on('player:effect', ({ effect }) => {
      const state = this.player.state;
      const up = state.gravity === 'up';

      switch (effect) {
        case 'jump':
          this.particles.jump(state.position.x, state.position.y, primary, up);
          audioManager.play('jump', { rate: 0.9 + Math.random() * 0.2 });
          this.save.addStat('totalJumps', 1);
          break;
        case 'land':
          this.particles.land(state.position.x, state.position.y, secondary, up);
          audioManager.play('land', { volume: 0.5 });
          break;
        case 'flip':
          this.particles.portal(state.position.x, state.position.y, primary);
          audioManager.play('portal', { rate: 1.2, volume: 0.6 });
          break;
        case 'trail':
          this.particles.trail(state.position.x, state.position.y, primary);
          break;
        case 'bounce':
          audioManager.play('bounce');
          this.particles.portal(state.position.x, state.position.y, PALETTE.LIME);
          break;
        default:
          break;
      }
    });

    this.player.events.on('player:died', ({ position }) => {
      this.onDeath(position.x, position.y, primary, secondary);
    });

    this.player.events.on('player:finished', () => this.onFinish());

    this.player.events.on('player:collected', ({ obstacle }) => {
      this.particles.collect(obstacle.x, obstacle.y, PALETTE.AMBER);
      audioManager.play('coin');
      this.views.get(obstacle.id)?.destroy();
      this.views.delete(obstacle.id);
      this.hud.addCoin();
    });

    this.player.events.on('player:mode-changed', ({ mode }) => {
      this.visual.setMode(mode);
      audioManager.play('portal');
      this.flash(PALETTE.MAGENTA, 0.12);
      this.particles.portal(
        this.player.state.position.x,
        this.player.state.position.y,
        PALETTE.MAGENTA,
      );
    });

    this.player.events.on('player:speed-changed', () => {
      audioManager.play('portal', { rate: 1.4, volume: 0.7 });
      this.cameraController.shake(4, 0.2);
    });
  }

  private wireBeatEvents(): void {
    this.sync.beats.events.on('beat', ({ strength }) => {
      this.background.onBeat(strength);
      this.hud.pulse(strength);
    });

    this.sync.beats.events.on('bar', () => {
      if (this.save.settings.reducedMotion) return;
      // A very small zoom breath on the bar line; enough to feel, not enough to
      // interfere with reading the level ahead.
      this.cameraController.zoomTo(1.012, 0.09, 'easeOut');
      this.time.delayedCall(95, () => this.cameraController.zoomTo(1, 0.22, 'easeOut'));
    });
  }

  private wireKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.on('keydown-ESC', () => this.togglePause());
    keyboard.on('keydown-R', () => this.startAttempt(false));

    if (this.practice) {
      keyboard.on('keydown-Z', () => this.placeCheckpoint(true));
      keyboard.on('keydown-X', () => this.removeCheckpoint());
    }
  }

  // ---------- Attempt lifecycle ----------

  private startAttempt(first: boolean): void {
    this.ended = false;
    this.paused = false;
    this.attemptTime = 0;
    this.timeSinceAutoCheckpoint = 0;

    this.world.resetAll();
    this.particles.clear();
    this.controller.reset();
    this.cameraController.resetOverrides();
    this.cameraController.setShakeScale(this.save.settings.screenShake);

    // Views destroyed by collection are rebuilt, so a restart is a true reset.
    this.rebuildMissingViews();

    const checkpoint = this.practice ? this.checkpoints[this.checkpoints.length - 1] : undefined;

    if (checkpoint) {
      this.player.setCheckpoint(checkpoint.player);
      this.player.respawn();
      this.triggers.reset(checkpoint.player.position.x, checkpoint.songTime, 0);
      this.sync.seek(checkpoint.songTime);
    } else {
      this.player.resetToStart();
      this.triggers.reset();
      this.sync.reset();
    }

    this.visual.setMode(this.player.state.mode);
    this.visual.setVisible(true);
    this.visual.sync(this.player.state, 0);
    this.cameraController.snapTo(this.player.state.position.x, this.player.state.position.y);

    this.stepper.reset();
    this.player.start();

    this.attempts += 1;
    this.hud.setAttempts(this.attempts);
    this.hud.setCheckpoints(this.checkpointProgressMarks());
    this.hud.resetCoins();

    this.save.addStat('totalAttempts', 1);
    this.save.updateProgress(this.level.id, { attempts: this.attempts });

    void this.startAudio(checkpoint?.songTime ?? 0, first);
  }

  /**
   * Starts the music, unlocking audio first if the browser still requires it.
   *
   * The unlock can only succeed after a gesture; when it has not happened yet
   * the level still runs, silently, and picks the music up on the next attempt.
   */
  private async startAudio(fromSeconds: number, first: boolean): Promise<void> {
    if (!audioManager.isUnlocked) {
      await audioManager.unlock();
    }
    if (!audioManager.isUnlocked) {
      if (first) logger.info('GameplayScene', 'Audio still locked; playing without music');
      return;
    }
    this.sync.start(this.level.song, fromSeconds);
  }

  private rebuildMissingViews(): void {
    for (const obstacle of this.obstacles) {
      if (obstacle.type === 'decor') continue;
      if (this.views.has(obstacle.id)) continue;
      this.views.set(obstacle.id, levelObjectFactory.createView(this, obstacle));
    }
  }

  private onDeath(x: number, y: number, primary: number, secondary: number): void {
    if (this.ended) return;
    this.ended = true;

    this.particles.death(x, y, primary, secondary);
    this.visual.setVisible(false);
    audioManager.play('death');
    this.cameraController.shake(14, 0.35);
    this.flash(PALETTE.CORAL, 0.16);
    this.sync.music.fadeOut(0.25);

    this.save.addStat('totalDeaths', 1);
    this.recordProgress();

    // A short pause before restarting: instant respawn reads as a glitch, and a
    // long one is the single most irritating thing a game of this genre can do.
    this.time.delayedCall(520, () => {
      if (this.scene.isActive()) this.startAttempt(false);
    });
  }

  private onFinish(): void {
    if (this.ended) return;
    this.ended = true;

    this.particles.finish(this.player.state.position.x, this.player.state.position.y);
    audioManager.play('finish');
    this.flash(PALETTE.LIME, 0.25);
    this.controller.setEnabled(false);

    this.save.updateProgress(this.level.id, {
      bestProgress: this.practice ? undefined : 1,
      bestPracticeProgress: this.practice ? 1 : undefined,
      completed: !this.practice,
      coinsCollected: this.player.drainCollected(),
      timePlayed: this.save.getProgress(this.level.id).timePlayed + this.attemptTime,
    });
    if (!this.practice) this.save.addStat('levelsCompleted', 1);
    this.save.flush();

    this.hud.showComplete(this.practice);

    this.time.delayedCall(2200, () => {
      if (this.scene.isActive()) this.scene.start(SCENES.LEVEL_SELECT);
    });
  }

  private recordProgress(): void {
    const progress = this.currentProgress();
    this.bestProgressThisSession = Math.max(this.bestProgressThisSession, progress);

    this.save.updateProgress(this.level.id, {
      bestProgress: this.practice ? undefined : progress,
      bestPracticeProgress: this.practice ? progress : undefined,
      coinsCollected: this.player.drainCollected(),
      timePlayed: this.save.getProgress(this.level.id).timePlayed + this.attemptTime,
    });
  }

  /** 0..1 by horizontal distance, which is what the player actually sees. */
  private currentProgress(): number {
    const span = this.finishX - this.startX;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, (this.player.state.position.x - this.startX) / span));
  }

  // ---------- Practice mode ----------

  private placeCheckpoint(manual: boolean): void {
    if (!this.practice || this.ended) return;
    if (this.checkpoints.length >= PRACTICE.MAX_CHECKPOINTS) return;

    this.checkpoints.push({
      id: `cp_${this.checkpoints.length}`,
      player: clonePlayerState(this.player.state),
      songTime: this.sync.songTime,
      progress: this.currentProgress(),
      manual,
    });

    if (manual) {
      audioManager.play('checkpoint');
      this.particles.burst(this.player.state.position.x, this.player.state.position.y, {
        color: PALETTE.LIME,
        count: 10,
        speed: [40, 160],
      });
    }

    this.hud.setCheckpoints(this.checkpointProgressMarks());
  }

  private removeCheckpoint(): void {
    if (!this.practice || this.checkpoints.length === 0) return;
    this.checkpoints.pop();
    audioManager.play('erase');
    this.hud.setCheckpoints(this.checkpointProgressMarks());
  }

  private checkpointProgressMarks(): number[] {
    return this.checkpoints.map((checkpoint) => checkpoint.progress);
  }

  // ---------- Pause ----------

  private togglePause(): void {
    if (this.ended) return;

    this.paused = !this.paused;

    if (this.paused) {
      this.sync.pause();
      this.controller.setEnabled(false);
      this.hud.showPause({
        onResume: () => this.togglePause(),
        onRestart: () => {
          this.hud.hidePause();
          this.paused = false;
          this.startAttempt(false);
        },
        onQuit: () => {
          this.save.flush();
          this.scene.start(SCENES.LEVEL_SELECT);
        },
        onPractice: () => {
          this.save.flush();
          this.scene.restart({ levelId: this.level.id, practice: !this.practice });
        },
        practice: this.practice,
      });
    } else {
      this.hud.hidePause();
      this.controller.setEnabled(true);
      this.sync.resume();
      this.stepper.reset();
    }
  }

  private flash(color: number, duration: number): void {
    if (this.save.settings.reducedMotion) return;
    this.flashRect.setFillStyle(color, 0.42);
    this.tweens.add({
      targets: this.flashRect,
      fillAlpha: 0,
      duration: duration * 1000,
      ease: 'Quad.easeOut',
    });
  }

  // ---------- Frame loop ----------

  override update(_time: number, deltaMs: number): void {
    if (!this.player) return;

    const dt = deltaMs / 1000;

    if (this.paused) {
      this.hud.update(dt, this.game.loop.actualFps);
      return;
    }

    this.sync.update(dt);
    this.attemptTime += dt;
    this.save.update(dt);

    // --- Fixed-step simulation.
    const ticks = this.stepper.advance(dt);
    for (let i = 0; i < ticks; i += 1) {
      if (this.ended) break;
      const input = this.controller.sample();
      this.player.tick(SIM.FIXED_DT, input);
      this.triggers.update(
        SIM.FIXED_DT,
        this.player.state,
        this.sync.songTime,
        this.sync.beats.currentBeat,
      );
    }

    // --- Presentation, once per rendered frame.
    for (const obstacle of this.obstacles) {
      obstacle.update(dt, this.sync.songTime);
      const view = this.views.get(obstacle.id) as
        | (Phaser.GameObjects.GameObject & {
            x: number;
            y: number;
            angle: number;
            setScale?: (s: number) => void;
          })
        | undefined;
      if (!view) continue;
      view.x = obstacle.x;
      view.y = obstacle.y;
      view.angle = obstacle.rotation;
    }

    const state = this.player.state;
    this.visual.sync(state, this.stepper.alpha);
    this.cameraController.update(dt, this.visual.x, this.visual.y);
    this.background.update(dt, this.cameraController.scrollX);
    this.particles.update(dt);

    // --- Practice auto-checkpoints.
    if (this.practice && !this.ended && state.grounded) {
      this.timeSinceAutoCheckpoint += dt;
      if (this.timeSinceAutoCheckpoint >= PRACTICE.AUTO_CHECKPOINT_INTERVAL) {
        this.timeSinceAutoCheckpoint = 0;
        this.placeCheckpoint(false);
      }
    }

    // --- HUD.
    const progress = this.currentProgress();
    this.hud.setProgress(progress);
    this.hud.update(dt, this.game.loop.actualFps);

    // --- End of the song with no finish object reached.
    if (!this.ended && this.sync.songTime > this.level.duration + 1) {
      this.player.kill(null);
    }
  }

  private teardown(): void {
    this.sync?.stop();
    this.controller?.destroy();
    this.player?.destroy();
    this.visual?.destroy();
    this.particles?.destroy();
    this.background?.destroy();
    this.triggers?.clear();
    this.hud?.destroy();
    this.views.clear();
    this.world?.clear();
    this.save?.flush();
  }
}
