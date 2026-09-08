import Phaser from 'phaser';

/**
 * Builds the hit-area rectangle for an interactive Container.
 *
 * Phaser normalises a pointer's local coordinates by adding the Game Object's
 * `displayOrigin` before testing them against the hit area (see
 * `InputManager#pointWithinHitArea`), and a Container that has been given a
 * size always reports a `displayOrigin` of exactly half that size. So a
 * rectangle written in the same local space the container *draws* in ends up
 * testing half a widget to the left of, and above, the artwork — the hit area
 * and the pixels drift apart by (width / 2, height / 2).
 *
 * Pass the rectangle in drawing coordinates — the space the container's own
 * Graphics and Text children use — and the returned one will line up with it.
 *
 * Must be called *after* `setSize`, since the shift is derived from it.
 */
export function containerHitArea(
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(
    x + container.width / 2,
    y + container.height / 2,
    width,
    height,
  );
}

/**
 * Tests a point given in drawing coordinates against a rectangle produced by
 * {@link containerHitArea}, applying the same origin normalisation Phaser's
 * input manager does.
 */
export function containerContains(
  container: Phaser.GameObjects.Container,
  hitArea: Phaser.Geom.Rectangle,
  localX: number,
  localY: number,
): boolean {
  return Phaser.Geom.Rectangle.Contains(
    hitArea,
    localX + container.displayOriginX,
    localY + container.displayOriginY,
  );
}
