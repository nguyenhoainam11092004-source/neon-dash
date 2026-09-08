import Phaser from 'phaser';
import { PALETTE } from '@/config/constants';

/**
 * The shapes a player can wear.
 *
 * Every shape is drawn from primitives against a size of `size` pixels centred
 * on the origin, using the player's two chosen colours plus a white rim. That
 * contract is what lets a shape be a pure data entry: the catalogue below is
 * the only place that has to change to add one, and nothing about the
 * simulation, the hit box or the modes is involved. The hit box stays the same
 * square whatever shape is worn, so no shape is easier or harder to play.
 */
export interface PlayerShape {
  /** Matches the id suffix in the cosmetic catalogue, e.g. "skin:hexagon". */
  id: string;
  name: string;
  draw: (
    g: Phaser.GameObjects.Graphics,
    primary: number,
    secondary: number,
    size: number,
  ) => void;
}

const RIM_WIDTH = 2.5;
const RIM_ALPHA = 0.85;

/** Corner points of a regular polygon, first point at the top. */
function polygon(sides: number, radius: number, rotation = -Math.PI / 2): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    points.push(new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}

/** Alternating outer and inner points, for stars and bursts. */
function star(
  spikes: number,
  outer: number,
  inner: number,
  rotation = -Math.PI / 2,
): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + (i / (spikes * 2)) * Math.PI * 2;
    points.push(new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}

/** Fills a point list in the primary colour and rims it in white. */
function fillAndRim(
  g: Phaser.GameObjects.Graphics,
  points: Phaser.Math.Vector2[],
  primary: number,
): void {
  g.fillStyle(primary, 1);
  g.fillPoints(points, true);
  g.lineStyle(RIM_WIDTH, PALETTE.WHITE, RIM_ALPHA);
  g.strokePoints(points, true);
}

export const PLAYER_SHAPES: readonly PlayerShape[] = [
  {
    id: 'classic',
    name: 'Classic',
    draw: (g, primary, secondary, size) => {
      const half = size / 2;
      g.fillStyle(primary, 1);
      g.fillRoundedRect(-half, -half, size, size, 6);
      g.fillStyle(secondary, 1);
      g.fillRoundedRect(-size * 0.225, -size * 0.225, size * 0.45, size * 0.45, 3);
      g.lineStyle(RIM_WIDTH, PALETTE.WHITE, RIM_ALPHA);
      g.strokeRoundedRect(-half, -half, size, size, 6);
    },
  },
  {
    id: 'circle',
    name: 'Orb',
    draw: (g, primary, secondary, size) => {
      const half = size / 2;
      g.fillStyle(primary, 1);
      g.fillCircle(0, 0, half);
      g.fillStyle(secondary, 1);
      g.fillCircle(0, 0, half * 0.42);
      g.lineStyle(RIM_WIDTH, PALETTE.WHITE, RIM_ALPHA);
      g.strokeCircle(0, 0, half);
    },
  },
  {
    id: 'triangle',
    name: 'Wedge',
    draw: (g, primary, secondary, size) => {
      const points = polygon(3, size * 0.58);
      fillAndRim(g, points, primary);
      g.fillStyle(secondary, 1);
      g.fillPoints(polygon(3, size * 0.24), true);
    },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    draw: (g, primary, secondary, size) => {
      fillAndRim(g, polygon(4, size * 0.62), primary);
      g.fillStyle(secondary, 1);
      g.fillPoints(polygon(4, size * 0.26), true);
    },
  },
  {
    id: 'pentagon',
    name: 'Pentagon',
    draw: (g, primary, secondary, size) => {
      fillAndRim(g, polygon(5, size * 0.56), primary);
      g.fillStyle(secondary, 1);
      g.fillPoints(polygon(5, size * 0.24), true);
    },
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    draw: (g, primary, secondary, size) => {
      fillAndRim(g, polygon(6, size * 0.55), primary);
      g.fillStyle(secondary, 1);
      g.fillPoints(polygon(6, size * 0.24), true);
    },
  },
  {
    id: 'star',
    name: 'Star',
    draw: (g, primary, secondary, size) => {
      fillAndRim(g, star(5, size * 0.62, size * 0.26), primary);
      g.fillStyle(secondary, 1);
      g.fillCircle(0, 0, size * 0.16);
    },
  },
  {
    id: 'burst',
    name: 'Burst',
    draw: (g, primary, secondary, size) => {
      fillAndRim(g, star(8, size * 0.58, size * 0.34), primary);
      g.fillStyle(secondary, 1);
      g.fillCircle(0, 0, size * 0.2);
    },
  },
  {
    id: 'ring',
    name: 'Ring',
    draw: (g, primary, secondary, size) => {
      const half = size / 2;
      // A true ring rather than a disc with a hole punched in it, so whatever
      // is behind the player shows through the middle.
      g.lineStyle(size * 0.3, primary, 1);
      g.strokeCircle(0, 0, half * 0.78);
      g.lineStyle(RIM_WIDTH, PALETTE.WHITE, RIM_ALPHA);
      g.strokeCircle(0, 0, half);
      g.strokeCircle(0, 0, half * 0.42);
      g.fillStyle(secondary, 1);
      g.fillCircle(0, -half * 0.78, size * 0.11);
    },
  },
  {
    id: 'cross',
    name: 'Cross',
    draw: (g, primary, secondary, size) => {
      const arm = size * 0.5;
      const thick = size * 0.19;
      const points = [
        new Phaser.Math.Vector2(-thick, -arm),
        new Phaser.Math.Vector2(thick, -arm),
        new Phaser.Math.Vector2(thick, -thick),
        new Phaser.Math.Vector2(arm, -thick),
        new Phaser.Math.Vector2(arm, thick),
        new Phaser.Math.Vector2(thick, thick),
        new Phaser.Math.Vector2(thick, arm),
        new Phaser.Math.Vector2(-thick, arm),
        new Phaser.Math.Vector2(-thick, thick),
        new Phaser.Math.Vector2(-arm, thick),
        new Phaser.Math.Vector2(-arm, -thick),
        new Phaser.Math.Vector2(-thick, -thick),
      ];
      fillAndRim(g, points, primary);
      g.fillStyle(secondary, 1);
      g.fillCircle(0, 0, size * 0.15);
    },
  },
  {
    id: 'heart',
    name: 'Heart',
    draw: (g, primary, secondary, size) => {
      const half = size / 2;
      const lobe = size * 0.26;
      // Two lobes plus a triangle reads as a heart without needing bezier
      // support, which Phaser's Graphics does not offer.
      g.fillStyle(primary, 1);
      g.fillCircle(-lobe * 0.85, -lobe * 0.5, lobe);
      g.fillCircle(lobe * 0.85, -lobe * 0.5, lobe);
      g.fillTriangle(-half * 0.96, -lobe * 0.18, half * 0.96, -lobe * 0.18, 0, half);
      g.fillStyle(secondary, 1);
      g.fillCircle(-lobe * 0.5, -lobe * 0.55, lobe * 0.32);
    },
  },
  {
    id: 'arrow',
    name: 'Arrow',
    draw: (g, primary, secondary, size) => {
      const half = size / 2;
      const points = [
        new Phaser.Math.Vector2(half, 0),
        new Phaser.Math.Vector2(0, -half),
        new Phaser.Math.Vector2(0, -half * 0.42),
        new Phaser.Math.Vector2(-half, -half * 0.42),
        new Phaser.Math.Vector2(-half, half * 0.42),
        new Phaser.Math.Vector2(0, half * 0.42),
        new Phaser.Math.Vector2(0, half),
      ];
      fillAndRim(g, points, primary);
      g.fillStyle(secondary, 1);
      g.fillCircle(-half * 0.3, 0, size * 0.14);
    },
  },
];

const BY_ID = new Map(PLAYER_SHAPES.map((shape) => [shape.id, shape]));

/** Falls back to Classic so an unknown or dropped id never leaves the player invisible. */
export function getPlayerShape(id: string): PlayerShape {
  return BY_ID.get(id) ?? (PLAYER_SHAPES[0] as PlayerShape);
}
