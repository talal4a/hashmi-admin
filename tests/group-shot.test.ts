import { describe, expect, it } from "vitest";
import {
  assortmentQueries,
  defaultCategoryQuery,
  namedThings,
  rankGroupShots,
  scoreGroupShot,
} from "@/lib/media/group-shot";

/**
 * The examples below are real text from Pixabay, Pexels and Unsplash, taken
 * from live searches for "fruits" and "vegetables assortment". A category tile
 * wants the first kind and not the second, and these pin which is which.
 */

const tagged = (tags: string[]) => ({ tags, attributionText: "" });

/* Assortments — what a category tile should show. */
const BASKET = tagged([
  "A basket filled with assorted fresh fruits including grapes, mango, pineapple, and kiwi",
]);
const MARKET_STALL = tagged(["fruit", "stall", "food", "sliced fruit", "fruit stand", "assorted fruits", "retail"]);
const WOODEN_TABLE = tagged([
  "Colorful variety of fresh fruits including watermelon, pineapple, and grapes on a wooden surface.",
]);
const VEG_PILE = tagged(["pile of vegetables"]);

/* Single items — what keeps turning up instead. */
const LONE_STRAWBERRY = tagged(["red strawberry fruit with white background"]);
const TWO_CHERRIES = tagged(["two cherries"]);
const CLOSE_UP_BERRIES = tagged([
  "A vibrant close-up of fresh strawberries, raspberries, blackberries, and blueberries.",
]);
const REPEATED_APPLE = tagged(["healthy", "vitamins", "apples", "fruit", "fruit", "fruit"]);

describe("namedThings", () => {
  it("counts the subjects a written description lists", () => {
    expect(namedThings([
      "A basket filled with assorted fresh fruits including grapes, mango, pineapple, and kiwi",
    ])).toBeGreaterThanOrEqual(4);
  });

  it("counts distinct subjects, not repeats or adjectives", () => {
    // A photo of one apple arrives from Pixabay as six tags. Counting them raw
    // scores it as six different things; counting "healthy" and "vitamins" as
    // subjects still scores it as four. Only "apples" and "fruit" are things.
    expect(namedThings(["healthy", "vitamins", "apples", "fruit", "fruit", "fruit"])).toBe(2);
  });

  it("returns zero when the provider said nothing", () => {
    expect(namedThings([])).toBe(0);
  });
});

describe("scoreGroupShot", () => {
  it("calls an assortment an assortment", () => {
    for (const image of [BASKET, MARKET_STALL, WOODEN_TABLE, VEG_PILE]) {
      expect(scoreGroupShot(image).verdict).toBe("group");
    }
  });

  it("calls a single item a single item", () => {
    for (const image of [LONE_STRAWBERRY, TWO_CHERRIES, REPEATED_APPLE]) {
      expect(scoreGroupShot(image).verdict).toBe("single");
    }
  });

  it("marks a close-up down even when it names several berries", () => {
    // Four subjects, but shot close enough that it reads as one punnet — so it
    // must not outrank an actual basket of mixed fruit.
    const closeUp = scoreGroupShot(CLOSE_UP_BERRIES);
    expect(closeUp.score).toBeLessThan(scoreGroupShot(BASKET).score);
  });

  it("stays within its stated range on anything", () => {
    for (const image of [BASKET, LONE_STRAWBERRY, tagged([]), tagged(["x"])]) {
      const { score } = scoreGroupShot(image);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("does not throw when a provider sends no tags at all", () => {
    expect(() => scoreGroupShot({ attributionText: "" })).not.toThrow();
    expect(scoreGroupShot({ attributionText: "" }).named).toBe(0);
  });
});

describe("rankGroupShots", () => {
  it("puts assortments above single items", () => {
    const ranked = rankGroupShots([LONE_STRAWBERRY, TWO_CHERRIES, BASKET, REPEATED_APPLE, MARKET_STALL]);
    expect(ranked.slice(0, 2)).toEqual(expect.arrayContaining([BASKET, MARKET_STALL]));
    expect(ranked.at(-1)).toBe(TWO_CHERRIES);
  });

  it("keeps the provider interleaving intact within equal scores", () => {
    // The search route interleaves providers so one cannot own the first row;
    // an unstable sort would quietly undo that.
    const a = tagged(["alpha"]);
    const b = tagged(["bravo"]);
    const c = tagged(["charlie"]);
    expect(rankGroupShots([a, b, c])).toEqual([a, b, c]);
  });

  it("returns an empty list unchanged", () => {
    expect(rankGroupShots([])).toEqual([]);
  });

  it("does not favour one provider's way of describing an image", () => {
    // Pixabay sends a long tag list, Pexels and Unsplash send one sentence.
    // Scoring the list higher for its length alone filled the top of the grid
    // with Pixabay, which is a ranking artefact rather than better pictures.
    const tagList = scoreGroupShot(MARKET_STALL).score;
    const sentence = scoreGroupShot(BASKET).score;
    expect(tagList).toBe(sentence);
  });
});

describe("assortmentQueries", () => {
  it("leads with the wording that measurably returns assortments", () => {
    expect(defaultCategoryQuery("Fresh Vegetables")).toBe("Fresh Vegetables assortment");
  });

  it("offers alternatives without the one that drifts off-subject", () => {
    const queries = assortmentQueries("Fruits");
    expect(queries.length).toBeGreaterThan(1);
    // "collection" turned a fruit search into walnuts, so it is not offered.
    expect(queries.join(" ")).not.toMatch(/collection/i);
  });

  it("has nothing to suggest for an unnamed category", () => {
    expect(assortmentQueries("   ")).toEqual([]);
    expect(defaultCategoryQuery("")).toBe("");
  });
});
