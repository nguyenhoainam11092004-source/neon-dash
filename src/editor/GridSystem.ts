import Phaser from 'phaser';
import { DEPTH, GRID, PALETTE, VIEW } from '@/config/constants';
import { snap } from '@/utils/MathUtils';

/**
 * The editor's grid, snapping and viewport transform.
 *
 * This owns the mapping between screen and world coordinates, which is the one
 * piece of arithmetic every other part of the editor depends on. Keeping it in
 * one place means pan, zoom and snapping cannot disagree about where a click
 * landed.
 */
export class GridSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;

  /** Index into GRID.SNAP_STEPS. */
  private snapIndex: number = GRID.DEFAULT_SNAP_INDEX;
  private snapEnabled = true;
  private visible = true;

  /** Camera position in world space, and zoom. */
  private cameraX = 0;
  private cameraY = 0;
  private zoomLevel = 1;

  /** Bounds beyond which panning is refused. */
  private minX = -2000;
  private maxX = 200_000;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.EDITOR_GRID).setScrollFactor(0);
  }

  // ---------- Snapping ----------

  get snapSize(): number {
    return GRID.SNAP_STEPS[this.snapIndex] ?? GRID.SIZE;
  }

  cycleSnap(direction: 1 | -1): number {
    const count = GRID.SNAP_STEPS.length;
    this.snapIndex = (this.snapIndex + direction + count) % count;
    return this.snapSize;
  }

  setSnapEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
  }

  get isSnapEnabled(): boolean {
    return this.snapEnabled;
  }

  /** Rounds a world coordinate to the current grid, when snapping is on. */
  snapValue(value: number): number {
    return this.snapEnabled ? snap(value, this.snapSize) : Math.round(value);
  }

  /**
   * Snaps a point to a cell *centre* rather than a corner.
   *
   * Level objects are positioned by their centres, so snapping to corners would
   * put every object half a cell off from where the grid suggests.
   */
  snapPoint(x: number, y: number): { x: number; y: number } {
    if (!this.snapEnabled) return { x: Math.round(x), y: Math.round(y) };
    const size = this.snapSize;
    return {
      x: Math.floor(x / size) * size + size / 2,
      y: Math.floor(y / size) * size + size / 2,
    };
  }

  // ---------- Viewport ----------

  get zoom(): number {
    return this.zoomLevel;
  }

  get scrollX(): number {
    return this.cameraX;
  }

  get scrollY(): number {
    return this.cameraY;
  }

  setPanBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = maxX;
  }

  panBy(dx: number, dy: number): void {
    // Divide by zoom so a drag moves the world under the cursor by the same
    // number of *screen* pixels at every zoom level.
    this.cameraX = Phaser.Math.Clamp(this.cameraX + dx / this.zoomLevel, this.minX, this.maxX);
    this.cameraY += dy / this.zoomLevel;
  }

  panTo(x: number, y: number): void {
    this.cameraX = Phaser.Math.Clamp(x, this.minX, this.maxX);
    this.cameraY = y;
  }

  /**
   * Zooms about a screen point, keeping the world position under it fixed.
   *
   * Zooming about the viewport centre instead is the classic mistake: the thing
   * the user is pointing at slides away as they scroll.
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoomLevel = Phaser.Math.Clamp(this.zoomLevel * factor, 0.15, 4);
    const after = this.screenToWorld(screenX, screenY);

    this.cameraX += before.x - after.x;
    this.cameraY += before.y - after.y;
    this.cameraX = Phaser.Math.Clamp(this.cameraX, this.minX, this.maxX);
  }

  setZoom(zoom: number): void {
    this.zoomLevel = Phaser.Math.Clamp(zoom, 0.15, 4);
  }

  /** Converts a point on the canvas to a point in the level. */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: this.cameraX + (screenX - VIEW.WIDTH / 2) / this.zoomLevel,
      y: this.cameraY + (screenY - VIEW.HEIGHT / 2) / this.zoomLevel,
    };
  }

  /** Converts a point in the level to a point on the canvas. */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.cameraX) * this.zoomLevel + VIEW.WIDTH / 2,
      y: (worldY - this.cameraY) * this.zoomLevel + VIEW.HEIGHT / 2,
    };
  }

  // ---------- Drawing ----------

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.graphics.setVisible(visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * Redraws the grid for the current viewport.
   *
   * Only the lines inside the visible rectangle are drawn, and the cell size is
   * stepped up when zoomed out so the screen never fills with a solid wash of
   * hairlines.
   */
  draw(canvasLeft: number, canvasTop: number, canvasWidth: number, canvasHeight: number): void {
    const g = this.graphics;
    g.clear();
    if (!this.visible) return;

    let cell = this.snapSize;
    // Below about 8 screen pixels a grid stops informing and starts obscuring.
    while (cell * this.zoomLevel < 8) cell *= 4;

    const topLeft = this.screenToWorld(canvasLeft, canvasTop);
    const bottomRight = this.screenToWorld(canvasLeft + canvasWidth, canvasTop + canvasHeight);

    const startX = Math.floor(topLeft.x / cell) * cell;
    const startY = Math.floor(topLeft.y / cell) * cell;

    g.lineStyle(1, PALETTE.VIOLET, 0.16);
    for (let x = startX; x <= bottomRight.x; x += cell) {
      const screen = this.worldToScreen(x, 0);
      if (screen.x < canvasLeft || screen.x > canvasLeft + canvasWidth) continue;
      g.lineBetween(screen.x, canvasTop, screen.x, canvasTop + canvasHeight);
    }
    for (let y = startY; y <= bottomRight.y; y += cell) {
      const screen = this.worldToScreen(0, y);
      if (screen.y < canvasTop || screen.y > canvasTop + canvasHeight) continue;
      g.lineBetween(canvasLeft, screen.y, canvasLeft + canvasWidth, screen.y);
    }

    // Every eighth line is brighter, so the eye can count cells at a glance.
    const major = cell * 8;
    g.lineStyle(1.5, PALETTE.VIOLET, 0.34);
    for (let x = Math.floor(topLeft.x / major) * major; x <= bottomRight.x; x += major) {
      const screen = this.worldToScreen(x, 0);
      if (screen.x < canvasLeft || screen.x > canvasLeft + canvasWidth) continue;
      g.lineBetween(screen.x, canvasTop, screen.x, canvasTop + canvasHeight);
    }
    for (let y = Math.floor(topLeft.y / major) * major; y <= bottomRight.y; y += major) {
      const screen = this.worldToScreen(0, y);
      if (screen.y < canvasTop || screen.y > canvasTop + canvasHeight) continue;
      g.lineBetween(canvasLeft, screen.y, canvasLeft + canvasWidth, screen.y);
    }

    // The world origin, so the author can always find x = 0.
    const origin = this.worldToScreen(0, 0);
    if (origin.x >= canvasLeft && origin.x <= canvasLeft + canvasWidth) {
      g.lineStyle(2, PALETTE.CYAN, 0.55);
      g.lineBetween(origin.x, canvasTop, origin.x, canvasTop + canvasHeight);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
