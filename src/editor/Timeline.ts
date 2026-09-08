import Phaser from 'phaser';
import { PALETTE, SPEED } from '@/config/constants';
import type { LevelData } from '@/types/LevelTypes';
import { FONT_STACK, UI_COLORS, hex, track } from '@/ui/Theme';
import { formatTime } from '@/utils/TimeUtils';

export interface TimelineOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  level: LevelData;
  /** Called when the author clicks a position; the argument is a world x. */
  onSeek: (worldX: number) => void;
}

/**
 * The editor's bottom strip: the level as a length of music.
 *
 * Its job is to make the *rhythm* of a level visible. Beat and bar lines are
 * drawn at the world positions the player will actually reach them, so an
 * author can see at a glance whether their obstacles land on the beat — which
 * is the difference between a rhythm level and a corridor of hazards.
 */
export class Timeline {
  private readonly scene: Phaser.Scene;
  private readonly options: TimelineOptions;
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly readout: Phaser.GameObjects.Text;

  private level: LevelData;

  /** Current viewport, pushed in by the scene each frame. */
  private cameraX = 0;
  private zoom = 1;

  constructor(scene: Phaser.Scene, options: TimelineOptions) {
    this.scene = scene;
    this.options = options;
    this.level = options.level;

    this.container = scene.add.container(options.x, options.y);
    this.graphics = scene.add.graphics();
    this.container.add(this.graphics);

    this.container.add(
      scene.add
        .text(12, 12, track('TIMELINE', 3), {
          fontFamily: FONT_STACK,
          fontSize: '10px',
          fontStyle: '800',
          color: hex(PALETTE.CYAN),
        })
        .setOrigin(0, 0.5),
    );

    this.readout = scene.add
      .text(options.width - 12, 12, '', {
        fontFamily: FONT_STACK,
        fontSize: '10px',
        fontStyle: '700',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(1, 0.5);
    this.container.add(this.readout);

    this.attachInput();
  }

  private attachInput(): void {
    const zone = this.scene.add
      .zone(0, 22, this.options.width, this.options.height - 22)
      .setOrigin(0)
      .setInteractive();
    this.container.add(zone);

    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.x - this.options.x;
      const fraction = Phaser.Math.Clamp(localX / this.options.width, 0, 1);
      this.options.onSeek(this.levelStartX + fraction * this.levelSpan);
    });
  }

  setLevel(level: LevelData): void {
    this.level = level;
  }

  /** World x the level begins at. */
  private get levelStartX(): number {
    return this.level.startX;
  }

  /**
   * How far, in world units, the level runs.
   *
   * Derived from the song length and the run speed rather than from the
   * rightmost object, so the strip represents the music the author is writing
   * to even where they have not placed anything yet.
   */
  private get levelSpan(): number {
    const finish = this.level.objects.find((object) => object.type === 'finish');
    const bySong = this.level.duration * SPEED.BASE * SPEED.MULTIPLIERS[this.level.startSpeed];
    const byObjects = finish ? finish.x - this.levelStartX : 0;
    return Math.max(1, byObjects, bySong);
  }

  /** Converts a world x to a position along the strip. */
  private worldToStrip(worldX: number): number {
    return ((worldX - this.levelStartX) / this.levelSpan) * this.options.width;
  }

  update(cameraX: number, zoom: number): void {
    this.cameraX = cameraX;
    this.zoom = zoom;
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    const { width, height } = this.options;
    const trackTop = 26;
    const trackHeight = height - trackTop - 10;

    g.clear();

    g.fillStyle(PALETTE.BG_MID, 0.98);
    g.fillRect(0, 0, width, height);
    g.lineStyle(1, PALETTE.VIOLET, 0.4);
    g.lineBetween(0, 0, width, 0);

    g.fillStyle(PALETTE.BLACK, 0.55);
    g.fillRect(0, trackTop, width, trackHeight);

    this.drawBeatLines(trackTop, trackHeight);
    this.drawObjectMarks(trackTop, trackHeight);
    this.drawTriggerMarks(trackTop, trackHeight);
    this.drawViewport(trackTop, trackHeight);

    const centreWorld = this.cameraX;
    const seconds =
      (centreWorld - this.levelStartX) / (SPEED.BASE * SPEED.MULTIPLIERS[this.level.startSpeed]) ||
      0;
    const beat = (seconds * this.level.bpm) / 60;

    this.readout.setText(
      `${formatTime(Math.max(0, seconds))}   BEAT ${Math.max(0, beat).toFixed(1)}   ` +
        `BPM ${this.level.bpm}   ZOOM ${(this.zoom * 100).toFixed(0)}%`,
    );
  }

  /** Beat and bar lines, thinned out when they would be too dense to read. */
  private drawBeatLines(top: number, height: number): void {
    const secondsPerBeat = 60 / this.level.bpm;
    const speed = SPEED.BASE * SPEED.MULTIPLIERS[this.level.startSpeed];
    const beatWidth = (secondsPerBeat * speed * this.options.width) / this.levelSpan;

    if (beatWidth < 1) return;

    const g = this.graphics;
    // Show every beat when there is room, otherwise only bar lines.
    const showBeats = beatWidth >= 4;
    const totalBeats = Math.ceil(this.levelSpan / (secondsPerBeat * speed));

    for (let beat = 0; beat <= totalBeats; beat += 1) {
      const x = beat * beatWidth;
      if (x > this.options.width) break;

      const isBar = beat % 4 === 0;
      const isPhrase = beat % 16 === 0;

      if (!isBar && !showBeats) continue;

      g.lineStyle(
        isPhrase ? 1.5 : 1,
        isPhrase ? PALETTE.CYAN : isBar ? PALETTE.VIOLET : PALETTE.GREY,
        isPhrase ? 0.75 : isBar ? 0.45 : 0.2,
      );
      g.lineBetween(x, top, x, top + height * (isPhrase ? 1 : isBar ? 0.72 : 0.4));
    }
  }

  /** One tick per object, coloured by whether it is a hazard or a portal. */
  private drawObjectMarks(top: number, height: number): void {
    const g = this.graphics;
    const midY = top + height * 0.55;

    for (const object of this.level.objects) {
      const x = this.worldToStrip(object.x);
      if (x < -2 || x > this.options.width + 2) continue;

      let color: number = PALETTE.VIOLET;
      let size = 3;

      switch (object.type) {
        case 'spike':
        case 'saw':
          color = PALETTE.CORAL;
          size = 4;
          break;
        case 'collectible':
          color = PALETTE.AMBER;
          size = 4;
          break;
        case 'finish':
          color = PALETTE.WHITE;
          size = 6;
          break;
        case 'modePortal':
        case 'gravityPortal':
        case 'speedPortal':
        case 'teleportPortal':
          color = PALETTE.MAGENTA;
          size = 5;
          break;
        default:
          break;
      }

      g.fillStyle(color, 0.85);
      g.fillRect(x - size / 2, midY - size / 2, size, size);
    }
  }

  /** Triggers sit on their own row so they never hide behind object marks. */
  private drawTriggerMarks(top: number, height: number): void {
    const g = this.graphics;
    const y = top + height * 0.86;

    for (const trigger of this.level.triggers) {
      if (trigger.x === undefined) continue;
      const x = this.worldToStrip(trigger.x);
      if (x < -2 || x > this.options.width + 2) continue;

      g.fillStyle(PALETTE.LIME, 0.9);
      g.fillTriangle(x - 4, y + 4, x + 4, y + 4, x, y - 4);
    }
  }

  /** A box showing which slice of the level the canvas is currently looking at. */
  private drawViewport(top: number, height: number): void {
    const g = this.graphics;
    const viewWorldWidth = 1280 / this.zoom;
    const left = this.worldToStrip(this.cameraX - viewWorldWidth / 2);
    const right = this.worldToStrip(this.cameraX + viewWorldWidth / 2);

    g.lineStyle(1.5, PALETTE.CYAN, 0.9);
    g.fillStyle(PALETTE.CYAN, 0.1);
    g.fillRect(left, top, Math.max(2, right - left), height);
    g.strokeRect(left, top, Math.max(2, right - left), height);
  }

  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
