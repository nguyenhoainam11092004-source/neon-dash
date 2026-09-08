import { GRID } from '@/config/constants';
import type { Obstacle, Rect } from '@/obstacles/Obstacle';

/**
 * A one-dimensional spatial index over the level's objects.
 *
 * A NEON DASH level is a long corridor: objects vary hugely in x and barely at
 * all in y, so bucketing by x alone gives almost all the benefit of a quadtree
 * for a fraction of the complexity. The player only ever queries a narrow window
 * around themselves, so a level with ten thousand objects costs the same per
 * frame as one with fifty.
 *
 * The index is rebuilt on level load and never during play; triggers that move
 * objects update their bucket through `refresh`.
 */
export class CollisionWorld {
  /** Bucket width in world pixels. */
  private readonly cellSize: number;

  /** Bucket index to the obstacles whose bounds touch it. */
  private readonly buckets = new Map<number, Obstacle[]>();

  /** Every obstacle, in insertion order, for iteration and reset. */
  private readonly all: Obstacle[] = [];

  /** Which buckets each obstacle currently occupies, so it can be re-indexed. */
  private readonly placement = new Map<string, number[]>();

  /** Scratch array reused by every query so the hot path allocates nothing. */
  private readonly queryResult: Obstacle[] = [];

  constructor(cellSize: number = GRID.SIZE * 8) {
    this.cellSize = cellSize;
  }

  /** Adds an obstacle and indexes it. */
  add(obstacle: Obstacle): void {
    this.all.push(obstacle);
    this.index(obstacle);
  }

  addAll(obstacles: Iterable<Obstacle>): void {
    for (const obstacle of obstacles) this.add(obstacle);
  }

  private bucketRange(bounds: Rect): { first: number; last: number } {
    return {
      first: Math.floor(bounds.x / this.cellSize),
      last: Math.floor((bounds.x + bounds.width) / this.cellSize),
    };
  }

  private index(obstacle: Obstacle): void {
    const { first, last } = this.bucketRange(obstacle.bounds);
    const cells: number[] = [];

    for (let cell = first; cell <= last; cell += 1) {
      let list = this.buckets.get(cell);
      if (!list) {
        list = [];
        this.buckets.set(cell, list);
      }
      list.push(obstacle);
      cells.push(cell);
    }

    this.placement.set(obstacle.id, cells);
  }

  private unindex(obstacle: Obstacle): void {
    const cells = this.placement.get(obstacle.id);
    if (!cells) return;

    for (const cell of cells) {
      const list = this.buckets.get(cell);
      if (!list) continue;
      const at = list.indexOf(obstacle);
      if (at >= 0) list.splice(at, 1);
    }
    this.placement.delete(obstacle.id);
  }

  /**
   * Re-indexes an obstacle that a trigger has moved.
   *
   * Only worth calling when the object actually left its buckets, which is why
   * the check happens here rather than at every call site.
   */
  refresh(obstacle: Obstacle): void {
    const cells = this.placement.get(obstacle.id);
    const { first, last } = this.bucketRange(obstacle.bounds);

    if (cells && cells.length === last - first + 1 && cells[0] === first) return;

    this.unindex(obstacle);
    this.index(obstacle);
  }

  /**
   * Every obstacle whose bucket overlaps [minX, maxX].
   *
   * The returned array is reused between calls: read it before the next query,
   * and never hold on to it.
   */
  query(minX: number, maxX: number): readonly Obstacle[] {
    this.queryResult.length = 0;

    const first = Math.floor(minX / this.cellSize);
    const last = Math.floor(maxX / this.cellSize);

    for (let cell = first; cell <= last; cell += 1) {
      const list = this.buckets.get(cell);
      if (!list) continue;

      for (const obstacle of list) {
        if (!obstacle.active) continue;
        // An obstacle spanning several buckets appears in each of them, so a
        // multi-bucket query would otherwise return it more than once.
        if (last > first && this.queryResult.includes(obstacle)) continue;
        this.queryResult.push(obstacle);
      }
    }

    return this.queryResult;
  }

  /** Every obstacle in the level, regardless of position. */
  get obstacles(): readonly Obstacle[] {
    return this.all;
  }

  /** Restores every obstacle to its authored state, for a new attempt. */
  resetAll(): void {
    for (const obstacle of this.all) {
      obstacle.reset();
      this.refresh(obstacle);
    }
  }

  clear(): void {
    this.buckets.clear();
    this.placement.clear();
    this.all.length = 0;
    this.queryResult.length = 0;
  }

  get size(): number {
    return this.all.length;
  }
}
