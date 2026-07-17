import { normalizeForMatching, normalizeSearchQuery } from "./queryNormalizer.js";
import type {
  AliasMatch,
  DetectedEntity,
  QueryPlan,
  QueryUnderstandingClient
} from "./types.js";
import type { RetrievalConfiguration } from "./retrievalConfig.js";

const ROMAN_PATTERN = /\b[IVXLCDM]+\b/giu;
const REFERENCE_PATTERN = /\b\d{1,4}(?::\d{1,4}(?:-\d{1,4})?)?\.?\b/gu;
const ORDINAL_PATTERN = /\b\d{1,4}\s*\./gu;
const NAMED_ENTITY_PATTERN = /\b\p{Lu}[\p{L}\p{M}'’-]*(?:\s+\p{Lu}[\p{L}\p{M}'’-]*)*/gu;

const romanValue = (input: string): number | null => {
  const values: Readonly<Record<string, number>> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000
  };
  const upper = input.toUpperCase();
  if (!/^(?=[MDCLXVI])M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(upper)) {
    return null;
  }
  let total = 0;
  for (let index = 0; index < upper.length; index += 1) {
    const current = values[upper[index] ?? ""] ?? 0;
    const next = values[upper[index + 1] ?? ""] ?? 0;
    total += current < next ? -current : current;
  }
  return total > 0 ? total : null;
};

const trUnits = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const trTens = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const trOrdinal: Readonly<Record<string, string>> = {
  bir: "birinci",
  iki: "ikinci",
  üç: "üçüncü",
  dört: "dördüncü",
  beş: "beşinci",
  altı: "altıncı",
  yedi: "yedinci",
  sekiz: "sekizinci",
  dokuz: "dokuzuncu",
  on: "onuncu",
  yirmi: "yirminci",
  otuz: "otuzuncu",
  kırk: "kırkıncı",
  elli: "ellinci",
  altmış: "altmışıncı",
  yetmiş: "yetmişinci",
  seksen: "sekseninci",
  doksan: "doksanıncı",
  yüz: "yüzüncü",
  bin: "bininci"
};

const turkishCardinal = (value: number): string | null => {
  if (!Number.isInteger(value) || value < 1 || value > 9999) return null;
  const parts: string[] = [];
  const thousands = Math.floor(value / 1000);
  const hundreds = Math.floor((value % 1000) / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  if (thousands > 0) parts.push(thousands === 1 ? "bin" : `${trUnits[thousands]} bin`);
  if (hundreds > 0) parts.push(hundreds === 1 ? "yüz" : `${trUnits[hundreds]} yüz`);
  if (tens > 0) parts.push(trTens[tens] ?? "");
  if (units > 0) parts.push(trUnits[units] ?? "");
  return parts.filter(Boolean).join(" ");
};

const turkishOrdinal = (value: number): string | null => {
  const cardinal = turkishCardinal(value);
  if (cardinal === null) return null;
  const words = cardinal.split(" ");
  const last = words.at(-1) ?? "";
  words[words.length - 1] = trOrdinal[last] ?? last;
  return words.join(" ");
};

const enSmall = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"
];
const enTens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const enOrdinals: Readonly<Record<string, string>> = {
  one: "first", two: "second", three: "third", four: "fourth", five: "fifth", six: "sixth",
  seven: "seventh", eight: "eighth", nine: "ninth", ten: "tenth", eleven: "eleventh",
  twelve: "twelfth", thirteen: "thirteenth", fourteen: "fourteenth", fifteen: "fifteenth",
  sixteen: "sixteenth", seventeen: "seventeenth", eighteen: "eighteenth", nineteen: "nineteenth",
  twenty: "twentieth", thirty: "thirtieth", forty: "fortieth", fifty: "fiftieth", sixty: "sixtieth",
  seventy: "seventieth", eighty: "eightieth", ninety: "ninetieth", hundred: "hundredth", thousand: "thousandth"
};

const englishCardinal = (value: number): string | null => {
  if (!Number.isInteger(value) || value < 1 || value > 9999) return null;
  if (value < 20) return enSmall[value] ?? null;
  if (value < 100) return `${enTens[Math.floor(value / 10)]}${value % 10 === 0 ? "" : ` ${enSmall[value % 10]}`}`;
  if (value < 1000) return `${enSmall[Math.floor(value / 100)]} hundred${value % 100 === 0 ? "" : ` ${englishCardinal(value % 100)}`}`;
  return `${enSmall[Math.floor(value / 1000)]} thousand${value % 1000 === 0 ? "" : ` ${englishCardinal(value % 1000)}`}`;
};

const englishOrdinal = (value: number): string | null => {
  const cardinal = englishCardinal(value);
  if (cardinal === null) return null;
  const words = cardinal.split(" ");
  const last = words.at(-1) ?? "";
  words[words.length - 1] = enOrdinals[last] ?? `${last}th`;
  return words.join(" ");
};

const writtenOrdinalMaps = new Map<string, readonly [string, number][]>();
const writtenOrdinals = (language: string): readonly [string, number][] => {
  const cached = writtenOrdinalMaps.get(language);
  if (cached !== undefined) return cached;
  const values: [string, number][] = [];
  for (let value = 1; value <= 999; value += 1) {
    const written = language === "tr" ? turkishOrdinal(value) : englishOrdinal(value);
    if (written !== null) values.push([written, value]);
  }
  values.sort((left, right) => right[0].length - left[0].length);
  writtenOrdinalMaps.set(language, values);
  return values;
};

const replaceWrittenOrdinals = (query: string, language: string): string => {
  let result = query;
  for (const [written, value] of writtenOrdinals(language)) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(written)}\\b`, "giu"), `${value}.`);
  }
  return result;
};

const replaceNumericOrdinals = (query: string, language: string): string =>
  query.replace(/\b(\d{1,4})(?:\s*\.)?(?=\s+\p{L})/gu, (match, digits: string) => {
    const value = Number(digits);
    const written = language === "tr" ? turkishOrdinal(value) : englishOrdinal(value);
    return written ?? match;
  });

const replaceRomanNumerals = (query: string): string =>
  query.replace(ROMAN_PATTERN, (match) => String(romanValue(match) ?? match));

const findEntities = (query: string): readonly DetectedEntity[] => {
  const entities: DetectedEntity[] = [];
  const add = (pattern: RegExp, type: DetectedEntity["type"], normalize: (value: string) => string) => {
    for (const match of query.matchAll(pattern)) {
      if (match.index === undefined) continue;
      entities.push({
        type,
        value: match[0],
        normalizedValue: normalize(match[0]),
        start: match.index,
        end: match.index + match[0].length
      });
    }
  };
  add(ORDINAL_PATTERN, "ordinal", (value) => value.replace(/\D/g, ""));
  add(REFERENCE_PATTERN, "reference", (value) => value.replace(/\.$/, ""));
  add(ROMAN_PATTERN, "roman-numeral", (value) => String(romanValue(value) ?? value));
  add(NAMED_ENTITY_PATTERN, "named-entity", normalizeForMatching);
  return entities.filter(
    (entity, index) =>
      entities.findIndex(
        (other) => other.type === entity.type && other.start === entity.start && other.end === entity.end
      ) === index
  );
};

export class ConfigurableQueryUnderstanding implements QueryUnderstandingClient {
  public constructor(private readonly config: RetrievalConfiguration) {}

  public understand(query: string): QueryPlan {
    const originalQuery = query;
    const normalizedQuery = normalizeSearchQuery(query).replace(/(\d)\.(?=\p{L})/gu, "$1. ");
    const detectedEntities = findEntities(normalizedQuery);
    const variants = new Set<string>([normalizedQuery]);
    this.expandNumbers(variants);

    const matchedAliases: AliasMatch[] = [];
    for (const group of this.config.aliases) {
      const terms = [group.canonical, ...group.aliases];
      const matchingTerm = terms.find((term) =>
        normalizeForMatching(normalizedQuery).includes(normalizeForMatching(term))
      );
      if (matchingTerm === undefined) continue;
      matchedAliases.push({ canonical: group.canonical, matched: matchingTerm });
      for (const variant of [...variants]) {
        for (const term of terms) {
          variants.add(
            variant.replace(
              new RegExp(escapeRegExp(matchingTerm), "giu"),
              term
            )
          );
        }
      }
    }
    this.expandNumbers(variants);

    return {
      originalQuery,
      normalizedQuery,
      expandedQueries: [...variants]
        .map((variant) => normalizeSearchQuery(variant))
        .filter((variant, index, all) => variant.length > 0 && all.indexOf(variant) === index)
        .slice(0, Math.max(1, this.config.maxExpandedQueries)),
      detectedEntities,
      matchedAliases
    };
  }

  private expandNumbers(variants: Set<string>): void {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const variant of [...variants]) {
        variants.add(replaceRomanNumerals(variant));
        for (const language of this.config.languages) {
          const numeric = replaceWrittenOrdinals(variant, language);
          variants.add(numeric);
          variants.add(replaceNumericOrdinals(numeric, language));
          for (const outputLanguage of this.config.languages) {
            variants.add(replaceNumericOrdinals(numeric, outputLanguage));
          }
        }
      }
    }
  }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const numberVariantsForTest = {
  turkishOrdinal,
  englishOrdinal,
  romanValue
};
