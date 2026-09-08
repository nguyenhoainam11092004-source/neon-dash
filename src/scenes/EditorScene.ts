import Phaser from 'phaser';
import { audioManager } from '@/audio/AudioManager';
import { DEPTH, GRID, PALETTE, SCENES, VIEW } from '@/config/constants';
import { EditorManager, defaultPropsFor } from '@/editor/EditorManager';
import { GridSystem } from '@/editor/GridSystem';
import { ObjectPalette } from '@/editor/ObjectPalette';
import { PropertyPanel } from '@/editor/PropertyPanel';
import { Timeline } from '@/editor/Timeline';
import { TEX } from '@/effects/TextureFactory';
import { levelManager } from '@/levels/LevelManager';
import { levelLoader } from '@/levels/LevelLoader';
import { levelSerializer } from '@/levels/LevelSerializer';
import type { SaveManager } from '@/save/SaveManager';
import type { LevelData, LevelObject, LevelObjectType } from '@/types/LevelTypes';
import { Button } from '@/ui/Button';
import { FONT_STACK, SPACING, UI_COLORS, hex } from '@/ui/Theme';
import { Toast } from '@/ui/Toast';
import { logger } from '@/utils/Logger';
import { generateId } from '@/utils/ValidationUtils';
import { parseHexColor } from '@/utils/MathUtils';

/** Which pointer gesture is in progress. */
type DragMode = 'none' | 'pan' | 'marquee' | 'move' | 'paint';

/** Layout constants for the editor chrome. */
const LAYOUT = {
  MENU_HEIGHT: 40,
  PALETTE_WIDTH: 168,
  TIMELINE_HEIGHT: 84,
  PROPERTY_WIDTH: 250,
} as const;

/**
 * The in-browser level editor.
 *
 * Its structure mirrors what it does on screen: a canvas in the middle, a
 * palette on the left, a property panel on the right, a timeline below and a
 * menu bar above. The scene owns input and rendering; every actual edit goes
 * through EditorManager, so the same operations are available headlessly and
 * every one of them is undoable.
 */
export class EditorScene extends Phaser.Scene {
  private save!: SaveManager;
  private editor!: EditorManager;
  private grid!: GridSystem;
  private palette!: ObjectPalette;
  private properties!: PropertyPanel;
  private timeline!: Timeline;
  private toast!: Toast;

  /** The world layer, transformed by the grid system rather than by a camera. */
  private worldLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Graphics;
  private chrome!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;

  private readonly views = new Map<string, Phaser.GameObjects.Container>();

  private dragMode: DragMode = 'none';
  private dragStartWorld = { x: 0, y: 0 };
  private dragLastWorld = { x: 0, y: 0 };
  private dragStartScreen = { x: 0, y: 0 };
  /** Objects painted during the current drag, so one drag is one undo step. */
  private paintedThisDrag: LevelObject[] = [];
  private paintedCells = new Set<string>();

  private needsRebuild = true;

  constructor() {
    super({ key: SCENES.EDITOR });
  }

  init(data: { level?: LevelData } | undefined): void {
    this.views.clear();
    this.needsRebuild = true;
    this.registry.set('editorSeedLevel', data?.level ?? null);
  }

  create(): void {
    this.save = this.registry.get('save') as SaveManager;

    const seed = this.registry.get('editorSeedLevel') as LevelData | null;
    this.editor = new EditorManager(
      seed ?? levelSerializer.createBlank('New Level', this.save.current.playerName),
    );

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);

    this.worldLayer = this.add.container(0, 0).setDepth(DEPTH.OBJECTS);
    this.overlay = this.add.graphics().setDepth(DEPTH.EDITOR_OVERLAY);
    this.grid = new GridSystem(this);
    this.grid.panTo(this.editor.current.startX + 300, this.editor.current.groundY - 200);

    this.chrome = this.add.container(0, 0).setDepth(DEPTH.UI);
    this.toast = new Toast(this);

    this.buildMenuBar();
    this.buildPalette();
    this.buildPropertyPanel();
    this.buildTimeline();
    this.buildStatusBar();

    this.attachPointer();
    this.attachKeyboard();

    this.editor.events.on('level:changed', () => {
      this.needsRebuild = true;
      this.timeline.setLevel(this.editor.current);
    });
    this.editor.events.on('selection:changed', ({ ids }) => {
      this.properties.setSelection(ids);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  // ---------- Chrome ----------

  private buildMenuBar(): void {
    const bar = this.add.graphics();
    bar.fillStyle(PALETTE.BG_MID, 0.98);
    bar.fillRect(0, 0, VIEW.WIDTH, LAYOUT.MENU_HEIGHT);
    bar.lineStyle(1, PALETTE.VIOLET, 0.4);
    bar.lineBetween(0, LAYOUT.MENU_HEIGHT, VIEW.WIDTH, LAYOUT.MENU_HEIGHT);
    this.chrome.add(bar);

    const entries: { label: string; color: number; action: () => void }[] = [
      { label: 'NEW', color: PALETTE.GREY, action: () => this.newLevel() },
      { label: 'OPEN', color: PALETTE.GREY, action: () => this.openLevel() },
      { label: 'SAVE', color: PALETTE.CYAN, action: () => this.saveLevel() },
      { label: 'EXPORT', color: PALETTE.VIOLET, action: () => this.exportLevel() },
      { label: 'IMPORT', color: PALETTE.VIOLET, action: () => this.importLevel() },
      { label: 'VALIDATE', color: PALETTE.AMBER, action: () => this.validateLevel() },
      { label: 'TEST', color: PALETTE.LIME, action: () => this.testLevel() },
      { label: 'EXIT', color: PALETTE.CORAL, action: () => this.exit() },
    ];

    let x = SPACING.sm + 40;
    for (const entry of entries) {
      const button = new Button(this, x, LAYOUT.MENU_HEIGHT / 2, {
        label: entry.label,
        width: 84,
        height: 28,
        color: entry.color,
        fontSize: 11,
        tracking: 0,
        onClick: entry.action,
      });
      this.chrome.add(button);
      x += 90;
    }

    const undoButton = new Button(this, VIEW.WIDTH - 250, LAYOUT.MENU_HEIGHT / 2, {
      label: 'UNDO',
      width: 74,
      height: 28,
      color: PALETTE.GREY,
      fontSize: 11,
      tracking: 0,
      onClick: () => this.editor.undo(),
    });
    const redoButton = new Button(this, VIEW.WIDTH - 170, LAYOUT.MENU_HEIGHT / 2, {
      label: 'REDO',
      width: 74,
      height: 28,
      color: PALETTE.GREY,
      fontSize: 11,
      tracking: 0,
      onClick: () => this.editor.redo(),
    });
    this.chrome.add([undoButton, redoButton]);

    this.editor.events.on('history:changed', ({ canUndo, canRedo }) => {
      undoButton.setEnabled(canUndo);
      redoButton.setEnabled(canRedo);
    });
    undoButton.setEnabled(false);
    redoButton.setEnabled(false);
  }

  private buildPalette(): void {
    this.palette = new ObjectPalette(this, {
      x: 0,
      y: LAYOUT.MENU_HEIGHT,
      width: LAYOUT.PALETTE_WIDTH,
      height: VIEW.HEIGHT - LAYOUT.MENU_HEIGHT - LAYOUT.TIMELINE_HEIGHT,
      onSelect: (type: LevelObjectType) => {
        this.editor.setBrush(type);
        audioManager.play('hover');
      },
    });
    this.chrome.add(this.palette.gameObject);
  }

  private buildPropertyPanel(): void {
    this.properties = new PropertyPanel(this, {
      x: VIEW.WIDTH - LAYOUT.PROPERTY_WIDTH,
      y: LAYOUT.MENU_HEIGHT,
      width: LAYOUT.PROPERTY_WIDTH,
      height: VIEW.HEIGHT - LAYOUT.MENU_HEIGHT - LAYOUT.TIMELINE_HEIGHT,
      editor: this.editor,
      onChanged: () => {
        this.needsRebuild = true;
      },
    });
    this.chrome.add(this.properties.gameObject);
  }

  private buildTimeline(): void {
    this.timeline = new Timeline(this, {
      x: 0,
      y: VIEW.HEIGHT - LAYOUT.TIMELINE_HEIGHT,
      width: VIEW.WIDTH,
      height: LAYOUT.TIMELINE_HEIGHT,
      level: this.editor.current,
      onSeek: (worldX) => this.grid.panTo(worldX, this.grid.scrollY),
    });
    this.chrome.add(this.timeline.gameObject);
  }

  private buildStatusBar(): void {
    this.statusText = this.add
      .text(LAYOUT.PALETTE_WIDTH + SPACING.md, LAYOUT.MENU_HEIGHT + SPACING.sm, '', {
        fontFamily: FONT_STACK,
        fontSize: '11px',
        fontStyle: '600',
        color: hex(UI_COLORS.textMuted),
      })
      .setDepth(DEPTH.UI);
    this.chrome.add(this.statusText);
  }

  // ---------- Canvas geometry ----------

  private get canvasRect(): { x: number; y: number; width: number; height: number } {
    return {
      x: LAYOUT.PALETTE_WIDTH,
      y: LAYOUT.MENU_HEIGHT,
      width: VIEW.WIDTH - LAYOUT.PALETTE_WIDTH - LAYOUT.PROPERTY_WIDTH,
      height: VIEW.HEIGHT - LAYOUT.MENU_HEIGHT - LAYOUT.TIMELINE_HEIGHT,
    };
  }

  private isOverCanvas(x: number, y: number): boolean {
    const rect = this.canvasRect;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  // ---------- Input ----------

  private attachPointer(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.isOverCanvas(pointer.x, pointer.y)) return;

      const world = this.grid.screenToWorld(pointer.x, pointer.y);
      this.dragStartWorld = world;
      this.dragLastWorld = world;
      this.dragStartScreen = { x: pointer.x, y: pointer.y };

      // Middle button or space-drag pans; that convention is near-universal in
      // editors and costs nothing to support.
      const panning =
        pointer.middleButtonDown() || this.input.keyboard?.checkDown(this.spaceKey, 0) === true;

      if (panning) {
        this.dragMode = 'pan';
        return;
      }

      if (pointer.rightButtonDown()) {
        this.eraseAt(world.x, world.y);
        this.dragMode = 'none';
        return;
      }

      const hit = this.editor.objectAt(world.x, world.y);

      if (hit) {
        const additive = this.isShiftDown();
        if (additive) this.editor.selection.toggle([hit.id]);
        else if (!this.editor.selection.has(hit.id)) this.editor.selection.set([hit.id]);
        this.dragMode = 'move';
        return;
      }

      if (this.isShiftDown()) {
        this.dragMode = 'marquee';
        return;
      }

      // Empty canvas, no modifier: paint. Painting on drag is what makes
      // building a floor bearable.
      this.dragMode = 'paint';
      this.paintedThisDrag = [];
      this.paintedCells.clear();
      this.paintAt(world.x, world.y);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.dragMode === 'none') return;

      const world = this.grid.screenToWorld(pointer.x, pointer.y);

      switch (this.dragMode) {
        case 'pan':
          this.grid.panBy(
            -(pointer.x - pointer.prevPosition.x),
            -(pointer.y - pointer.prevPosition.y),
          );
          break;

        case 'move': {
          // Snap the *destination* rather than the delta, so a dragged object
          // lands on the grid regardless of where within it the drag began.
          const snapped = this.grid.snapPoint(world.x, world.y);
          const previous = this.grid.snapPoint(this.dragLastWorld.x, this.dragLastWorld.y);
          const dx = snapped.x - previous.x;
          const dy = snapped.y - previous.y;
          if (dx !== 0 || dy !== 0) {
            this.editor.moveSelected(dx, dy);
            this.dragLastWorld = world;
          }
          break;
        }

        case 'paint':
          this.paintAt(world.x, world.y);
          break;

        case 'marquee':
          this.dragLastWorld = world;
          break;
      }
    });

    const endDrag = (pointer: Phaser.Input.Pointer): void => {
      if (this.dragMode === 'marquee') {
        const world = this.grid.screenToWorld(pointer.x, pointer.y);
        this.editor.selectInRect(
          this.dragStartWorld.x,
          this.dragStartWorld.y,
          world.x - this.dragStartWorld.x,
          world.y - this.dragStartWorld.y,
          false,
        );
      }

      if (this.dragMode === 'paint') this.commitPaintStroke();

      // A click that neither moved nor hit anything clears the selection.
      if (
        this.dragMode === 'move' &&
        Math.abs(pointer.x - this.dragStartScreen.x) < 3 &&
        Math.abs(pointer.y - this.dragStartScreen.y) < 3 &&
        !this.isShiftDown()
      ) {
        const world = this.grid.screenToWorld(pointer.x, pointer.y);
        const hit = this.editor.objectAt(world.x, world.y);
        if (hit) this.editor.selection.set([hit.id]);
      }

      this.dragMode = 'none';
    };

    this.input.on(Phaser.Input.Events.POINTER_UP, endDrag);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, endDrag);

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        if (!this.isOverCanvas(pointer.x, pointer.y)) return;

        if (this.isCtrlDown()) {
          // Ctrl+wheel scales the selection, matching most drawing tools.
          this.editor.scaleSelected(dy > 0 ? 0.9 : 1.1);
          return;
        }

        this.grid.zoomAt(pointer.x, pointer.y, dy > 0 ? 0.9 : 1.1);
      },
    );
  }

  private spaceKey!: Phaser.Input.Keyboard.Key;

  private attachKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.spaceKey = keyboard.addKey('SPACE', false, false);

    keyboard.on('keydown', (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;

      // The editor owns these combinations; letting the browser also act on
      // them would scroll the page or open a save dialog.
      if (ctrl && ['z', 'y', 'c', 'v', 'x', 'd', 'a', 's'].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }

      switch (event.key.toLowerCase()) {
        case 'z':
          // Ctrl+Shift+Z is the second redo binding, alongside Ctrl+Y.
          if (ctrl && event.shiftKey) this.editor.redo();
          else if (ctrl) this.editor.undo();
          break;
        case 'y':
          if (ctrl) this.editor.redo();
          break;
        case 'c':
          if (ctrl && this.editor.copySelection()) {
            this.toast.show(`Copied ${this.editor.clipboard.count} object(s)`, 'info', 1.6);
          }
          break;
        case 'x':
          if (ctrl && this.editor.cutSelection()) {
            this.toast.show('Cut to clipboard', 'info', 1.6);
          }
          break;
        case 'v':
          if (ctrl) this.pasteAtCursor();
          break;
        case 'd':
          if (ctrl && this.editor.duplicateSelection()) {
            audioManager.play('place');
          }
          break;
        case 'a':
          if (ctrl) this.editor.selectAll();
          break;
        case 's':
          if (ctrl) this.saveLevel();
          break;
        case 'delete':
        case 'backspace':
          this.editor.deleteSelected();
          audioManager.play('erase');
          break;
        case 'escape':
          this.editor.selection.clear();
          break;
        case 'g':
          this.grid.setVisible(!this.grid.isVisible);
          break;
        case 'r':
          this.editor.rotateSelected(event.shiftKey ? -90 : 90);
          break;
        case '[':
          this.toast.show(`Grid ${this.grid.cycleSnap(-1)} px`, 'info', 1.2);
          break;
        case ']':
          this.toast.show(`Grid ${this.grid.cycleSnap(1)} px`, 'info', 1.2);
          break;
        case 'arrowleft':
          this.editor.moveSelected(-(event.shiftKey ? GRID.SIZE : this.grid.snapSize), 0);
          break;
        case 'arrowright':
          this.editor.moveSelected(event.shiftKey ? GRID.SIZE : this.grid.snapSize, 0);
          break;
        case 'arrowup':
          this.editor.moveSelected(0, -(event.shiftKey ? GRID.SIZE : this.grid.snapSize));
          break;
        case 'arrowdown':
          this.editor.moveSelected(0, event.shiftKey ? GRID.SIZE : this.grid.snapSize);
          break;
      }
    });
  }

  private isShiftDown(): boolean {
    return this.input.keyboard?.addKey('SHIFT', false, false).isDown ?? false;
  }

  private isCtrlDown(): boolean {
    return this.input.keyboard?.addKey('CTRL', false, false).isDown ?? false;
  }

  private pasteAtCursor(): void {
    const pointer = this.input.activePointer;
    const world = this.grid.screenToWorld(pointer.x, pointer.y);
    const snapped = this.grid.snapPoint(world.x, world.y);
    if (this.editor.pasteAt(snapped.x, snapped.y)) {
      audioManager.play('place');
    }
  }

  // ---------- Editing gestures ----------

  /**
   * Adds one object to the current paint stroke.
   *
   * Painted objects go into the level immediately so the author sees them under
   * the cursor, but they are not committed to the undo history until the stroke
   * ends: one drag should be one undo, not eighty.
   */
  private paintAt(worldX: number, worldY: number): void {
    const snapped = this.grid.snapPoint(worldX, worldY);
    const cellKey = `${snapped.x},${snapped.y}`;

    // One object per grid cell per stroke, so dragging slowly does not stack a
    // hundred blocks in the same place.
    if (this.paintedCells.has(cellKey)) return;
    this.paintedCells.add(cellKey);

    if (this.editor.objectAt(snapped.x, snapped.y, 2)) return;

    const type = this.editor.currentBrush;
    const object: LevelObject = {
      id: generateId('obj'),
      type,
      x: snapped.x,
      y: snapped.y,
      rotation: 0,
      scale: 1,
      props: defaultPropsFor(type),
    };

    this.paintedThisDrag.push(object);
    this.editor.current.objects.push(object);
    this.needsRebuild = true;
    audioManager.play('place', { volume: 0.35 });
  }

  /**
   * Turns the preview objects into one undoable placement.
   *
   * The previews are removed first so `placeMany` is the only thing that ever
   * added them; otherwise undo would leave them behind.
   */
  private commitPaintStroke(): void {
    if (this.paintedThisDrag.length === 0) return;

    const pending = new Set(this.paintedThisDrag.map((object) => object.id));
    const objects = this.editor.current.objects;
    for (let i = objects.length - 1; i >= 0; i -= 1) {
      const object = objects[i];
      if (object && pending.has(object.id)) objects.splice(i, 1);
    }

    this.editor.placeMany(this.paintedThisDrag);
    this.paintedThisDrag = [];
    this.paintedCells.clear();
  }

  private eraseAt(worldX: number, worldY: number): void {
    const hit = this.editor.objectAt(worldX, worldY);
    if (!hit) return;
    this.editor.selection.set([hit.id]);
    this.editor.deleteSelected();
    audioManager.play('erase');
  }

  // ---------- Menu actions ----------

  private newLevel(): void {
    this.editor.open(levelSerializer.createBlank('New Level', this.save.current.playerName));
    this.toast.show('New level created', 'info');
  }

  private openLevel(): void {
    const created = this.save.current.createdLevels;
    if (created.length === 0) {
      this.toast.show('No saved levels yet', 'warning');
      return;
    }
    // Opens the most recent; a full picker belongs on the level select screen,
    // which already lists created levels.
    const level = created[created.length - 1];
    if (!level) return;
    this.editor.open(level);
    this.toast.show(`Opened "${level.name}"`, 'success');
  }

  private saveLevel(): void {
    const result = this.editor.validate();
    if (result.status === 'ERROR') {
      const first = result.issues.find((issue) => issue.severity === 'error');
      this.toast.show(`Cannot save: ${first?.message ?? 'validation failed'}`, 'error');
      return;
    }

    this.save.saveCreatedLevel(this.editor.current);
    this.save.flush();
    this.editor.markSaved();
    levelManager.addImported(this.editor.current);
    this.toast.show(`Saved "${this.editor.current.name}"`, 'success');
  }

  private exportLevel(): void {
    try {
      const json = this.editor.toJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = this.editor.exportFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      this.toast.show(`Exported ${this.editor.exportFileName}`, 'success');
    } catch (error) {
      this.toast.show(
        `Export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    }
  }

  private importLevel(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      void file
        .text()
        .then((text) => {
          const result = levelLoader.fromJson(text);
          if (!result.ok) {
            this.toast.show(`Import failed: ${result.error}`, 'error');
            return;
          }
          this.editor.open(result.level);
          this.grid.panTo(result.level.startX + 300, result.level.groundY - 200);
          this.toast.show(`Imported "${result.level.name}"`, 'success');
        })
        .catch(() => this.toast.show('Could not read that file', 'error'));
    });

    document.body.appendChild(input);
    input.click();
  }

  private validateLevel(): void {
    const result = this.editor.validate();

    if (result.status === 'PASS') {
      this.toast.show('Validation passed', 'success');
      return;
    }

    const errors = result.issues.filter((issue) => issue.severity === 'error');
    const warnings = result.issues.filter((issue) => issue.severity === 'warning');

    for (const issue of [...errors, ...warnings].slice(0, 3)) {
      this.toast.show(
        `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`,
        issue.severity === 'error' ? 'error' : 'warning',
        5,
      );
    }

    if (errors.length + warnings.length > 3) {
      this.toast.show(`...and ${errors.length + warnings.length - 3} more`, 'info');
    }
  }

  private testLevel(): void {
    const result = this.editor.validate();
    if (result.status === 'ERROR') {
      this.toast.show('Fix the errors before testing', 'error');
      return;
    }

    // Register under its own id so the gameplay scene can load it by id like
    // any other level; the editor state is kept for the return trip.
    levelManager.addImported(this.editor.current);
    this.registry.set('editorSeedLevel', this.editor.current);
    this.registry.set('returnToEditor', true);
    this.scene.start(SCENES.GAMEPLAY, { levelId: this.editor.current.id, practice: true });
  }

  private exit(): void {
    if (this.editor.hasUnsavedChanges) {
      this.toast.show('Unsaved changes - press EXIT again to discard', 'warning', 3);
      // A second press within the toast's lifetime confirms.
      this.editor.markSaved();
      return;
    }
    this.scene.start(SCENES.MAIN_MENU);
  }

  // ---------- Rendering ----------

  /**
   * Rebuilds the world layer from the level document.
   *
   * Only run when the document actually changed. Between changes the layer is
   * simply transformed, so panning and zooming stay smooth on large levels.
   */
  private rebuildViews(): void {
    this.worldLayer.removeAll(true);
    this.views.clear();

    const level = this.editor.current;

    // Floor and ceiling reference lines.
    const guides = this.add.graphics();
    guides.lineStyle(2, PALETTE.VIOLET, 0.6);
    guides.lineBetween(-4000, level.groundY, 400_000, level.groundY);
    guides.lineStyle(2, PALETTE.VIOLET, 0.35);
    guides.lineBetween(-4000, level.ceilingY, 400_000, level.ceilingY);
    guides.lineStyle(2, PALETTE.LIME, 0.8);
    guides.lineBetween(level.startX, level.ceilingY, level.startX, level.groundY);
    this.worldLayer.add(guides);

    for (const object of level.objects) {
      const view = this.buildObjectView(object);
      this.worldLayer.add(view);
      this.views.set(object.id, view);
    }
  }

  /** A simplified representation: fast to build and clear to read while editing. */
  private buildObjectView(object: LevelObject): Phaser.GameObjects.Container {
    const container = this.add.container(object.x, object.y);
    const size = GRID.SIZE * object.scale;
    const tint = parseHexColor(String(object.props?.color ?? '')) ?? EDITOR_TINTS[object.type];

    let sprite: Phaser.GameObjects.Image;

    switch (object.type) {
      case 'spike':
        sprite = this.add.image(0, 0, TEX.TRIANGLE).setDisplaySize(size, size);
        break;
      case 'saw':
        sprite = this.add.image(0, 0, TEX.SAW).setDisplaySize(size * 1.5, size * 1.5);
        break;
      case 'collectible':
        sprite = this.add.image(0, 0, TEX.COIN).setDisplaySize(size * 0.8, size * 0.8);
        break;
      case 'jumpRing':
        sprite = this.add.image(0, 0, TEX.RING).setDisplaySize(size, size);
        break;
      case 'block':
      case 'platform': {
        const w = Number(object.props?.width ?? (object.type === 'platform' ? 4 : 1)) * GRID.SIZE;
        const h =
          Number(object.props?.height ?? (object.type === 'platform' ? 0.5 : 1)) * GRID.SIZE;
        sprite = this.add
          .image(0, 0, TEX.SQUARE)
          .setDisplaySize(w * object.scale, h * object.scale);
        break;
      }
      default:
        sprite = this.add.image(0, 0, TEX.SQUARE).setDisplaySize(size * 0.75, size * 2.4);
        break;
    }

    sprite.setTint(tint);
    container.add(sprite);
    container.setAngle(object.rotation);

    // A short label on portals, so the author can read a level's flow without
    // clicking every portal in it.
    const label = PORTAL_LABELS[object.type];
    if (label) {
      const text = this.add
        .text(
          0,
          0,
          String(object.props?.mode ?? object.props?.speed ?? object.props?.gravity ?? label)
            .slice(0, 4)
            .toUpperCase(),
          {
            fontFamily: FONT_STACK,
            fontSize: '10px',
            fontStyle: '800',
            color: hex(PALETTE.WHITE),
          },
        )
        .setOrigin(0.5);
      container.add(text);
    }

    return container;
  }

  /** Draws selection outlines and the marquee. */
  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();

    const rect = this.canvasRect;

    for (const id of this.editor.selection.ids) {
      const object = this.editor.current.objects.find((entry) => entry.id === id);
      if (!object) continue;

      const screen = this.grid.worldToScreen(object.x, object.y);
      if (
        screen.x < rect.x - 60 ||
        screen.x > rect.x + rect.width + 60 ||
        screen.y < rect.y - 60 ||
        screen.y > rect.y + rect.height + 60
      ) {
        continue;
      }

      const size = GRID.SIZE * object.scale * this.grid.zoom;
      g.lineStyle(2, PALETTE.CYAN, 0.95);
      g.strokeRect(screen.x - size / 2 - 3, screen.y - size / 2 - 3, size + 6, size + 6);
    }

    if (this.dragMode === 'marquee') {
      const a = this.grid.worldToScreen(this.dragStartWorld.x, this.dragStartWorld.y);
      const b = this.grid.worldToScreen(this.dragLastWorld.x, this.dragLastWorld.y);
      g.lineStyle(1.5, PALETTE.CYAN, 0.9);
      g.fillStyle(PALETTE.CYAN, 0.12);
      g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      g.strokeRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      );
    }

    // A ghost of the brush at the snapped cursor position.
    const pointer = this.input.activePointer;
    if (this.isOverCanvas(pointer.x, pointer.y) && this.dragMode === 'none') {
      const world = this.grid.screenToWorld(pointer.x, pointer.y);
      const snapped = this.grid.snapPoint(world.x, world.y);
      const screen = this.grid.worldToScreen(snapped.x, snapped.y);
      const size = GRID.SIZE * this.grid.zoom;
      g.lineStyle(1.5, EDITOR_TINTS[this.editor.currentBrush], 0.7);
      g.strokeRect(screen.x - size / 2, screen.y - size / 2, size, size);
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (!this.editor) return;
    const dt = deltaMs / 1000;

    if (this.needsRebuild) {
      this.rebuildViews();
      this.needsRebuild = false;
    }

    // The whole world layer is transformed, rather than each object being moved:
    // one matrix update instead of thousands.
    this.worldLayer.setScale(this.grid.zoom);
    this.worldLayer.setPosition(
      VIEW.WIDTH / 2 - this.grid.scrollX * this.grid.zoom,
      VIEW.HEIGHT / 2 - this.grid.scrollY * this.grid.zoom,
    );

    const rect = this.canvasRect;
    this.grid.draw(rect.x, rect.y, rect.width, rect.height);
    this.drawOverlay();
    this.timeline.update(this.grid.scrollX, this.grid.zoom);
    this.toast.update(dt);

    const pointer = this.input.activePointer;
    const world = this.grid.screenToWorld(pointer.x, pointer.y);
    this.statusText.setText(
      `${Math.round(world.x)}, ${Math.round(world.y)}   ` +
        `GRID ${this.grid.snapSize}   ZOOM ${(this.grid.zoom * 100).toFixed(0)}%   ` +
        `OBJECTS ${this.editor.objectCount}   TRIGGERS ${this.editor.triggerCount}   ` +
        `SELECTED ${this.editor.selection.size}   BRUSH ${this.editor.currentBrush.toUpperCase()}`,
    );
  }

  private teardown(): void {
    this.grid?.destroy();
    this.palette?.destroy();
    this.properties?.destroy();
    this.timeline?.destroy();
    this.toast?.clear();
    this.views.clear();
    logger.debug('EditorScene', 'Editor shut down');
  }
}

/** Editor-only tints, chosen so object types are distinguishable at a glance. */
const EDITOR_TINTS: Record<LevelObjectType, number> = {
  block: PALETTE.VIOLET,
  spike: PALETTE.CORAL,
  saw: PALETTE.CORAL,
  platform: PALETTE.CYAN,
  jumpPad: PALETTE.LIME,
  jumpRing: PALETTE.AMBER,
  collectible: PALETTE.AMBER,
  gravityPortal: PALETTE.LIME,
  speedPortal: PALETTE.CYAN,
  modePortal: PALETTE.MAGENTA,
  teleportPortal: PALETTE.VIOLET,
  finish: PALETTE.WHITE,
  decor: PALETTE.GREY,
};

const PORTAL_LABELS: Partial<Record<LevelObjectType, string>> = {
  gravityPortal: 'GRAV',
  speedPortal: 'SPD',
  modePortal: 'MODE',
  teleportPortal: 'TP',
  finish: 'END',
};
