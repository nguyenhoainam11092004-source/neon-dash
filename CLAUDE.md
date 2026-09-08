# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NEON DASH — an original 2D rhythm platformer (Geometry-Dash-like genre, no copied assets/code/levels) built with TypeScript, Phaser 3, Vite, and the Web Audio API. All art is procedurally generated at runtime (`src/effects/TextureFactory.ts`) and all music is synthesized in-browser (`src/audio/SongLibrary.ts`) — the game ships no binary asset files.

## Commands

```bash
npm run dev            # Vite dev server (http://localhost:5173)
npm run build          # tsc --noEmit && vite build -> dist/
npm run preview        # preview the production build
npm run typecheck      # tsc --noEmit only
npm test               # vitest run (all tests, once)
npm run test:watch     # vitest watch mode
npm run lint           # eslint .
npm run lint:fix       # eslint . --fix
npm run format         # prettier --write
npm run format:check   # prettier --check
npm run levels         # regenerate public/levels/*.json + manifest.json from src/levels/officialLevels.ts
```

Run a single test file: `npx vitest run tests/unit/PlayerPhysics.test.ts`
Run a single test by name: `npx vitest run -t "lands the player on the floor"`

The `@/` import alias maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`/`vitest.config.ts`).

## Architecture

### Fixed-timestep simulation, decoupled from rendering

Gameplay does **not** run on Phaser's `update(time, delta)` directly. `GameplayScene` accumulates frame time via `FixedStepAccumulator` (`src/utils/TimeUtils.ts`, step size `SIM.FIXED_DT` = 1/240s from `src/config/constants.ts`) and calls `Player.tick()` a deterministic number of times per frame. Rendering then interpolates using the leftover `alpha` fraction (see `PlayerVisual.sync`). This is what keeps physics identical across refresh rates and makes runs replayable/verifiable (see `LeaderboardService`'s input-log design). Never make gameplay logic read `delta` directly — it must go through the fixed step.

### Audio-clock-driven rhythm sync

Music position is authoritative time, not `setTimeout`/`setInterval`. `AudioSyncManager` (`src/audio/`) reads `AudioContext.currentTime` via `MusicManager`, and gently corrects the gameplay clock toward it (`resync()`), snapping hard only on large discontinuities (tab backgrounding, seeks). `BeatManager` derives beat/bar/subdivision events purely from song position (never a timer), so a dropped frame delays a visual reaction but never skips or double-fires a beat.

### Data-driven game modes, obstacles, portals, triggers

Nowhere in the codebase does gameplay branch on `if (mode === 'cube')`. Instead:

- **Game modes** (`src/gameModes/`): each implements the `GameMode` interface (`GameMode.ts`) — `enter/exit/update/updateRotation/onLand/onBoost`. `GameModeManager` (`src/player/`) holds all seven and routes to whichever is active. Adding a mode = one new class + one registry line.
- **Obstacles** (`src/obstacles/`) and **portals** (`src/portals/`): both extend `Obstacle` (`Obstacle.ts`), which exposes `contactKind` (`solid | lethal | interactive | none`) and `overlaps()`. `LevelObjectFactory` (`src/levels/`) is the single place mapping a `LevelObjectType` string to a class — this is the only type-switch in the whole physics/render path.
- **Triggers** (`src/triggers/`): `TriggerRuntime` arms triggers (by x-position, song time, beat, or collision) and `Trigger.ts`'s `advanceTrigger` applies the tween. Trigger _type_ just selects which fields of `value` are read (`TRIGGER_FIELDS` table) — there's no per-type trigger class.

### One level format, shared by game and editor

`LevelData` (`src/types/LevelTypes.ts`) is the only level schema. `LevelSerializer` parses/normalizes raw JSON into it (filling every missing field with a safe default — never throws on partial data), `LevelValidator` grades a level PASS/WARNING/ERROR before it's played or saved, and `LevelBuilder` (`src/levels/LevelBuilder.ts`) is a fluent, beat-based authoring DSL used to generate the 10 shipped levels (`src/levels/officialLevels.ts` → `scripts/generate-levels.ts` → `public/levels/*.json`). The in-browser `EditorScene`/`EditorManager` (`src/editor/`) edit this exact same `LevelData` object — there is no separate "editor format." Editor edits are `Command` objects (`EditorCommands.ts`) run through `UndoRedoManager`, with `MoveCommand.mergeWith` collapsing a drag into one undo step.

### Collision broad-phase

`CollisionWorld` (`src/player/CollisionWorld.ts`) buckets obstacles by x-position only (a NEON DASH level is a long corridor, not a 2D field), so a query near the player is O(1) regardless of level size.

### Player as a facade over four collaborators

`Player` (`src/player/Player.ts`) coordinates, in fixed order every tick: `GameModeManager.update` (mode decides velocity) → `PlayerPhysics.step` (integrate + resolve collision) → `GameModeManager.updateRotation` → portal/interaction effects. This order is intentional and load-bearing (e.g., landing must resolve before a hazard behind the landing spot is tested) — don't reorder it. `PlayerState` (`src/types/PlayerTypes.ts`) is plain data with no behavior, so checkpoints (`clonePlayerState`) and the editor's preview are cheap and safe to snapshot.

Player shapes (`src/player/PlayerShapes.ts`) are the cosmetic counterpart to game modes: a data table of `{ id, name, draw }` entries, each a pure function that paints one silhouette from primitives using the player's two chosen colours. `PlayerVisual` only draws the equipped shape for the ground-based Cube/Robot modes — the flying modes (Ship/Ball/UFO/Wave/Swing) keep their fixed silhouette regardless of the equipped shape, because that silhouette is what tells the player which mode they're in, and a cosmetic must never be able to hide that. Adding a shape is one entry in `PLAYER_SHAPES` plus one line in `InventoryManager`'s `COSMETICS` catalogue (kind `'skin'`, id `skin:<shapeId>`) — nothing else changes.

### Interactive Containers: hit areas need explicit origin compensation

Phaser adds a Game Object's `displayOrigin` to a pointer's coordinates before testing them against its hit area (`InputManager#pointWithinHitArea`), and a `Container` that has called `setSize()` always reports `displayOrigin` as exactly half that size — even though a Container drawn centred-on-origin (the pattern every widget here uses: children positioned from `-width/2` to `width/2`) has no such offset in its own drawing space. Pass a hit-area rectangle straight to `setInteractive()` without accounting for this and the clickable region silently drifts half a widget-width left and half a widget-height up from what's actually drawn. Every interactive Container (`Button`, `Slider`, `Toggle`, `LevelSelectScene`'s cards) builds its hit area through `containerHitArea()`/`containerContains()` in `src/ui/HitArea.ts` instead of constructing a `Phaser.Geom.Rectangle` directly — do the same for any new one, or its clicks will land on the wrong spot.

Relatedly, `Button` resolves a click on the scene-wide `POINTER_UP` event with its own hit test (see the comment in `Button.ts#attachHandlers`), not on `GAMEOBJECT_POINTER_UP`. Phaser only fires the latter when its own hit test — re-run fresh per raw DOM event — still lists the object as "currently over" at that exact instant; an ordinary `mousedown` immediately followed by a sub-pixel `mousemove` (normal cursor jitter, and what most scripted/fast clicks produce) can make Phaser fire `GAMEOBJECT_POINTER_OUT` for that move and then never re-fire `GAMEOBJECT_POINTER_UP` on release, silently dropping a click that visibly landed on the button. The scene-level `POINTER_UP` event always fires on every release inside the canvas, so checking geometry against that instead is what makes clicks reliable.

### Everything else

- **Persistence** (`src/save/`): `SaveManager` owns the one `localStorage` document; `SaveMigration` upgrades old schema versions (bump `SAVE.SAVE_VERSION` + add a migration entry when changing `SaveData`'s shape); `repair()` defends against hand-edited/corrupt storage.
- **Progression** (`src/progression/`): `AchievementManager` and `InventoryManager` are catalogue-driven (`ACHIEVEMENTS`/`COSMETICS` arrays) — adding one is a data entry, not new code. `COSMETICS` covers four kinds (`skin`, `color`, `trail`, `death`); `ProfileScene`'s Customise tab renders each kind as its own row and always draws the live preview with the same `PlayerShapes`/colour code the game itself uses, so the preview can't drift out of sync with what a level actually shows.
- **Online-ready but not deployed** (`src/online/`): `ApiClient` returns a clear "not configured" error when `VITE_API_BASE_URL` is unset rather than pretending to succeed; `LeaderboardService`'s `ScoreSubmission` includes a replayable input log because client-reported scores are meant to be server-verified, never trusted directly.
- **Scenes** (`src/scenes/`): Boot → Preload → MainMenu → LevelSelect → Gameplay/Practice/Editor → Settings/Profile. `PracticeScene` is `GameplayScene` registered under a second scene key with the `practice` flag forced on — not a separate implementation.
- All textures come from `TextureFactory.generateCoreTextures` (canvas-drawn shapes, cached by key) and all sound from `AudioManager`'s synthesized `SFX` table / `SongLibrary`'s procedural composition — there are no image or audio files to add under `public/assets/`. Pill-shaped UI (`RADIUS.pill`) must go through `Theme.pillRadius(width, height)` rather than using the constant directly: Phaser's `fillRoundedRect`/`strokeRoundedRect` don't clamp the radius to the shape's own size, so a raw `RADIUS.pill` on anything thinner than ~60px sweeps an arc far larger than the shape and streaks across the screen.
