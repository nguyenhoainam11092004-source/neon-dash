/**
 * Writes the ten shipped levels to public/levels as JSON, plus a manifest.
 *
 * The levels are authored in TypeScript (see officialLevels.ts) because beats
 * and grid cells are easier to reason about than pixel coordinates, but the
 * game loads plain JSON — the same format the in-game editor produces. This
 * script is the bridge, run by `npm run levels`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOfficialLevels } from '../src/levels/officialLevels';
import { LevelValidator } from '../src/levels/LevelValidator';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '..', 'public', 'levels');

function main(): void {
  mkdirSync(outputDir, { recursive: true });

  const validator = new LevelValidator();
  const levels = buildOfficialLevels();

  const manifest = {
    version: 1,
    levels: [] as {
      id: string;
      name: string;
      difficulty: string;
      file: string;
      song: string;
      bpm: number;
      duration: number;
      order: number;
    }[],
  };

  let failures = 0;

  levels.forEach((level, index) => {
    const result = validator.validate(level);

    for (const issue of result.issues) {
      if (issue.severity === 'info') continue;
      const label = issue.severity.toUpperCase();
      console.warn(`  [${label}] ${level.id} ${issue.path}: ${issue.message}`);
    }

    if (result.status === 'ERROR') {
      failures += 1;
      console.error(`FAILED: ${level.id} did not validate; not written`);
      return;
    }

    const fileName = `${level.id}.json`;
    writeFileSync(join(outputDir, fileName), JSON.stringify(level), 'utf8');

    manifest.levels.push({
      id: level.id,
      name: level.name,
      difficulty: level.difficulty,
      file: `levels/${fileName}`,
      song: level.song,
      bpm: level.bpm,
      duration: level.duration,
      order: index,
    });

    console.info(
      `  ${level.id.padEnd(28)} ${String(level.objects.length).padStart(4)} objects  ` +
        `${String(level.triggers.length).padStart(3)} triggers  ${level.difficulty}`,
    );
  });

  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.info(`\nWrote ${manifest.levels.length} levels to ${outputDir}`);

  if (failures > 0) {
    console.error(`${failures} level(s) failed validation`);
    process.exit(1);
  }
}

main();
