import { describe, expect, it } from "vitest";
import { MAX_COLLAGE_ITEMS, collageLayout } from "@/lib/media/collage";

/**
 * The arrangement is hand-placed data, so these check the properties that make
 * it look like a pile of produce rather than a grid of thumbnails — and that
 * nothing falls off the edge of the tile.
 */
describe("collageLayout", () => {
  const counts = [1, 2, 3, 4, 5, 6];

  it("places exactly as many items as it was given", () => {
    for (const count of counts) {
      expect(collageLayout(count)).toHaveLength(count);
    }
  });

  it("keeps every item inside the tile", () => {
    for (const count of counts) {
      for (const slot of collageLayout(count)) {
        // Half the item's size either side of its centre must stay on canvas.
        expect(slot.x - slot.size / 2).toBeGreaterThanOrEqual(-0.02);
        expect(slot.x + slot.size / 2).toBeLessThanOrEqual(1.02);
        expect(slot.y - slot.size / 2).toBeGreaterThanOrEqual(-0.02);
        expect(slot.y + slot.size / 2).toBeLessThanOrEqual(1.02);
      }
    }
  });

  it("gives every item a usable share of the tile", () => {
    for (const count of counts) {
      for (const slot of collageLayout(count)) {
        // Below about a third of the tile a product is no longer recognisable
        // at the size the app actually renders these.
        expect(slot.size).toBeGreaterThanOrEqual(0.35);
        expect(slot.size).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it("leans items without tumbling them", () => {
    for (const count of counts) {
      for (const slot of collageLayout(count)) {
        expect(Math.abs(slot.rotation)).toBeLessThanOrEqual(12);
      }
    }
  });

  it("spreads items out instead of stacking them on one spot", () => {
    for (const count of counts.filter((c) => c > 1)) {
      const slots = collageLayout(count);
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const dx = slots[i].x - slots[j].x;
          const dy = slots[i].y - slots[j].y;
          expect(Math.hypot(dx, dy)).toBeGreaterThan(0.12);
        }
      }
    }
  });

  it("fills more of the tile as items are added", () => {
    // A four-item pile should cover more ground than a two-item one, otherwise
    // adding products makes the tile emptier rather than richer.
    const coverage = (count: number) =>
      collageLayout(count).reduce((sum, slot) => sum + slot.size * slot.size, 0);
    expect(coverage(4)).toBeGreaterThan(coverage(2));
    expect(coverage(6)).toBeGreaterThan(coverage(3));
  });

  it("handles counts outside the arrangements it has", () => {
    expect(collageLayout(0)).toHaveLength(1);
    expect(collageLayout(-3)).toHaveLength(1);
    expect(collageLayout(99)).toHaveLength(MAX_COLLAGE_ITEMS);
    expect(collageLayout(3.7)).toHaveLength(3);
  });
});
