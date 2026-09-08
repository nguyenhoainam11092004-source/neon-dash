import { PALETTE } from '@/config/constants';

/**
 * Shared look-and-feel for every piece of in-game UI.
 *
 * Widgets read from here instead of carrying their own colours and sizes, so
 * the interface stays coherent and a restyle is a single-file change.
 */

export const FONT_STACK =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export const UI_COLORS = {
  text: PALETTE.WHITE,
  textMuted: PALETTE.GREY,
  accent: PALETTE.CYAN,
  accentAlt: PALETTE.MAGENTA,
  highlight: PALETTE.VIOLET,
  positive: PALETTE.LIME,
  warning: PALETTE.AMBER,
  danger: PALETTE.CORAL,
  panel: PALETTE.BG_MID,
  panelEdge: PALETTE.VIOLET,
  overlay: PALETTE.BLACK,
} as const;

/** Type ramp. Sizes are in pixels at the 1280x720 design resolution. */
export const TYPE = {
  display: { size: 76, weight: '800', spacing: 14 },
  title: { size: 42, weight: '800', spacing: 6 },
  heading: { size: 26, weight: '700', spacing: 3 },
  body: { size: 18, weight: '500', spacing: 0 },
  label: { size: 15, weight: '600', spacing: 2 },
  caption: { size: 13, weight: '500', spacing: 1 },
} as const;

export type TypeRole = keyof typeof TYPE;

/** Consistent spacing scale, in pixels. */
export const SPACING = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 26,
  xl: 40,
  xxl: 64,
} as const;

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/** Converts a packed colour to the "#rrggbb" string Phaser text styles want. */
export function hex(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
}

/** Builds a Phaser text style from the type ramp. */
export function textStyle(
  role: TypeRole,
  color: number = UI_COLORS.text,
  overrides: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const spec = TYPE[role];
  return {
    fontFamily: FONT_STACK,
    fontSize: `${spec.size}px`,
    fontStyle: spec.weight,
    color: hex(color),
    ...overrides,
  };
}

/**
 * Letter-spacing is not a Phaser text style, so tracked headings are produced by
 * inserting thin spaces. Only used on short, upper-case labels.
 */
export function track(text: string, amount: number): string {
  if (amount <= 0) return text;
  const gap = amount >= 8 ? '  ' : ' ';
  return text.split('').join(gap);
}

/**
 * Corner radius for a pill-shaped rect, clamped to what the rect can hold.
 *
 * Phaser's fill/strokeRoundedRect does not clamp: handing it RADIUS.pill for a
 * 6px-tall slider track makes it sweep 999px arcs, which streak right across
 * the screen. Every pill must derive its radius from its own size.
 */
export function pillRadius(width: number, height: number): number {
  return Math.max(0, Math.min(RADIUS.pill, Math.min(width, height) / 2));
}
