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
- **Triggers** (`src/triggers/`): `TriggerRuntime` arms triggers (by x-position, song time, beat, or collision) and `Trigger.ts`'s `advanceTrigger` applies the tween. Trigger *type* just selects which fields of `value` are read (`TRIGGER_FIELDS` table) — there's no per-type trigger class.

### One level format, shared by game and editor

`LevelData` (`src/types/LevelTypes.ts`) is the only level schema. `LevelSerializer` parses/normalizes raw JSON into it (filling every missing field with a safe default — never throws on partial data), `LevelValidator` grades a level PASS/WARNING/ERROR before it's played or saved, and `LevelBuilder` (`src/levels/LevelBuilder.ts`) is a fluent, beat-based authoring DSL used to generate the 10 shipped levels (`src/levels/officialLevels.ts` → `scripts/generate-levels.ts` → `public/levels/*.json`). The in-browser `EditorScene`/`EditorManager` (`src/editor/`) edit this exact same `LevelData` object — there is no separate "editor format." Editor edits are `Command` objects (`EditorCommands.ts`) run through `UndoRedoManager`, with `MoveCommand.mergeWith` collapsing a drag into one undo step.

### Collision broad-phase

`CollisionWorld` (`src/player/CollisionWorld.ts`) buckets obstacles by x-position only (a NEON DASH level is a long corridor, not a 2D field), so a query near the player is O(1) regardless of level size.

### Player as a facade over four collaborators

`Player` (`src/player/Player.ts`) coordinates, in fixed order every tick: `GameModeManager.update` (mode decides velocity) → `PlayerPhysics.step` (integrate + resolve collision) → `GameModeManager.updateRotation` → portal/interaction effects. This order is intentional and load-bearing (e.g., landing must resolve before a hazard behind the landing spot is tested) — don't reorder it. `PlayerState` (`src/types/PlayerTypes.ts`) is plain data with no behavior, so checkpoints (`clonePlayerState`) and the editor's preview are cheap and safe to snapshot.

### Everything else

- **Persistence** (`src/save/`): `SaveManager` owns the one `localStorage` document; `SaveMigration` upgrades old schema versions (bump `SAVE.SAVE_VERSION` + add a migration entry when changing `SaveData`'s shape); `repair()` defends against hand-edited/corrupt storage.
- **Progression** (`src/progression/`): `AchievementManager` and `InventoryManager` are catalogue-driven (`ACHIEVEMENTS`/`COSMETICS` arrays) — adding one is a data entry, not new code.
- **Online-ready but not deployed** (`src/online/`): `ApiClient` returns a clear "not configured" error when `VITE_API_BASE_URL` is unset rather than pretending to succeed; `LeaderboardService`'s `ScoreSubmission` includes a replayable input log because client-reported scores are meant to be server-verified, never trusted directly.
- **Scenes** (`src/scenes/`): Boot → Preload → MainMenu → LevelSelect → Gameplay/Practice/Editor → Settings/Profile. `PracticeScene` is `GameplayScene` registered under a second scene key with the `practice` flag forced on — not a separate implementation.
- All textures come from `TextureFactory.generateCoreTextures` (canvas-drawn shapes, cached by key) and all sound from `AudioManager`'s synthesized `SFX` table / `SongLibrary`'s procedural composition — there are no image or audio files to add under `public/assets/`.
