import type { ProviderImageResult } from "@/types";

/**
 * Telling an assortment photo from a single-item photo (PRD §6).
 *
 * A category tile wants a pile of different fruit, not one strawberry on white.
 * Searching a category name gives mostly the latter: of ten results for
 * "fruits", eight were a single item or a single variety. Two things fix that,
 * and both are here — ask the providers a better question, then sort what comes
 * back so the assortments are on the first row.
 *
 * The signal is the text every provider already ships: Pixabay sends a tag
 * list, Pexels and Unsplash send a written description. Both give away the
 * answer plainly — "a basket filled with assorted fresh fruits including
 * grapes, mango, pineapple and kiwi" is not a single item, and it does not need
 * a model to work that out. Pure functions, so the rules are unit-tested
 * instead of eyeballed against whatever the API returned today.
 */

/** Words that mean "there is more than one kind of thing in this picture". */
const GROUP_WORDS = [
  "assortment",
  "assorted",
  "variety",
  "varieties",
  "mixed",
  "mix of",
  "selection",
  "collection",
  "arrangement",
  "different types",
  "different kinds",
  "various",
  "several",
  "pile of",
  "bunch of",
  "basket",
  "bowl of",
  "crate",
  "tray of",
  "market",
  "stall",
  "display",
  "groceries",
  "produce",
  "harvest",
  "flatlay",
  "flat lay",
  "still life",
  "set of",
];

/** Words that give away a single subject, often shot against white. */
const SINGLE_WORDS = [
  "close-up",
  "close up",
  "closeup",
  "macro",
  "isolated",
  "white background",
  "a single",
  "one single",
  "pair of",
  "two ",
  "half a",
  "cut in half",
  "slice of",
];

export type GroupShotVerdict = "group" | "single" | "unclear";

export interface GroupShotScore {
  /** -1 (clearly one item) to 1 (clearly an assortment). */
  score: number;
  verdict: GroupShotVerdict;
  /** How many distinct things the provider's own text names. */
  named: number;
}

/** Everything the provider said about the image, as one lowercase string. */
function textOf(result: Pick<ProviderImageResult, "tags" | "attributionText">): string {
  return (result.tags ?? []).join(" , ").toLowerCase();
}

/**
 * Tags that describe a photo rather than name what is in it.
 *
 * Pixabay's tag lists are half adjectives — a single apple arrives tagged
 * "healthy, vitamins, apples, fruit, fruit, fruit". Counting those as four
 * different subjects scored it as an assortment, which is exactly the mistake
 * this whole file exists to avoid.
 */
const DESCRIPTOR_TAGS = new Set([
  "healthy", "health", "fresh", "freshness", "food", "foods", "nature", "natural",
  "vitamins", "vitamin", "diet", "dieting", "organic", "delicious", "tasty", "yummy",
  "colorful", "colourful", "background", "backgrounds", "closeup", "close-up", "macro",
  "summer", "spring", "autumn", "winter", "vegan", "vegetarian", "nutrition", "nutritious",
  "eat", "eating", "raw", "ripe", "sweet", "juicy", "green", "red", "yellow", "orange",
  "isolated", "white", "studio", "photography", "image", "wallpaper",
]);

/**
 * How many distinct things the text names.
 *
 * Pixabay repeats its best tag several times, so the count has to be of
 * *distinct* tags, and of subjects rather than adjectives; a written
 * description lists its subjects with commas and a final "and", so those are
 * counted instead. Three or more named things is a good sign that the picture
 * holds a variety.
 */
export function namedThings(tags: string[]): number {
  if (tags.length === 0) return 0;

  // A single long entry is a written description rather than a tag list.
  const isSentence = tags.length === 1 && tags[0].trim().split(/\s+/).length > 4;
  if (isSentence) {
    const listed = tags[0]
      .toLowerCase()
      .replace(/\band\b/g, ",")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 2);
    return listed.length;
  }

  const subjects = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0 && !DESCRIPTOR_TAGS.has(tag));
  return new Set(subjects).size;
}

export function scoreGroupShot(
  result: Pick<ProviderImageResult, "tags" | "attributionText">,
): GroupShotScore {
  const text = textOf(result);
  const named = namedThings(result.tags ?? []);

  let score = 0;
  const hasGroupWord = GROUP_WORDS.some((word) => text.includes(word));
  const hasSingleWord = SINGLE_WORDS.some((word) => text.includes(word));

  if (hasGroupWord) score += 0.45;
  if (named >= 3) score += 0.3;
  if (hasSingleWord) score -= 0.45;
  // Two tags and nothing else to go on is almost always one subject.
  if (named <= 2 && !hasGroupWord) score -= 0.2;

  score = Math.max(-1, Math.min(1, Number(score.toFixed(3))));
  const verdict: GroupShotVerdict = score >= 0.35 ? "group" : score <= -0.15 ? "single" : "unclear";
  return { score, verdict, named };
}

/**
 * Assortments first, everything else in the order the providers returned it.
 *
 * A stable sort matters: within the same score the interleaving that gives each
 * provider a fair share of the first row has to survive. That is also why the
 * scale is coarse. A finer one rewarded Pixabay's long tag lists over the one
 * sentence Pexels and Unsplash send, and the top of the grid filled up with a
 * single provider — a ranking artefact, not better pictures.
 */
export function rankGroupShots<T extends Pick<ProviderImageResult, "tags" | "attributionText">>(
  results: T[],
): T[] {
  return results
    .map((result, index) => ({ result, index, score: scoreGroupShot(result).score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result);
}

/**
 * Queries that actually return assortments.
 *
 * Measured against the live providers: "fruits" returned two assortments in
 * ten, "vegetables assortment" returned seven in eight. The word carries real
 * weight, so the category search starts with it rather than hoping the ranking
 * can rescue a bad set of results. "collection" is deliberately absent — it
 * drifted a fruit search onto walnuts.
 */
export function assortmentQueries(categoryName: string): string[] {
  const name = categoryName.trim();
  if (!name) return [];
  return [`${name} assortment`, `assorted ${name} variety`, `${name} basket`, `mixed ${name}`];
}

/** The query a category search should open with. */
export function defaultCategoryQuery(categoryName: string): string {
  return assortmentQueries(categoryName)[0] ?? "";
}
