/**
 * Bamini → Unicode Tamil.
 *
 * Bamini is not an encoding, it is a font: the file holds ordinary Latin
 * characters ("juk;") that only look like Tamil ("தரம்") when drawn in that
 * font. KEDA's student lists are typed this way, so the text has to be
 * converted before it means anything in a database or a browser.
 *
 * Two things make this more than a character swap:
 *  - the vowel signs ெ ே ை are typed BEFORE their consonant ("nf" is கெ), and
 *    Unicode stores them after it;
 *  - ொ ோ ௌ are typed as a sign on each side ("nfh" is கொ).
 *
 * Pure and dependency-free, so it runs in the browser (the import preview) and
 * is easy to test. Characters it does not recognise are passed through
 * untouched, so anything it gets wrong is visible in the preview, not lost.
 */

const CONSONANTS: Record<string, string> = {
  f: "க", q: "ங", r: "ச", "[": "ஜ", Q: "ஞ", l: "ட", z: "ண", j: "த", e: "ந", d: "ன",
  g: "ப", k: "ம", a: "ய", u: "ர", w: "ற", y: "ல", s: "ள", o: "ழ", t: "வ",
  "]": "ஸ", "~": "ஷ", "\\": "ஷ", "`": "ஹ",
};

/** Whole syllables that Bamini draws as one glyph. Longest keys are tried first. */
const SYLLABLES: Record<string, string> = {
  // -u
  F: "கு", R: "சு", L: "டு", Z: "ணு", J: "து", E: "நு", D: "னு", G: "பு", K: "மு", A: "யு",
  U: "ரு", W: "று", Y: "லு", S: "ளு", O: "ழு", T: "வு",
  // -ū
  $: "கூ", "#": "சூ", "^": "டூ", "%": "மூ", "&": "ரூ", "*": "ழூ",
  "Z}": "ணூ", "J}": "தூ", "E}": "நூ", "D}": "னூ", "W}": "றூ", "Y}": "லூ", "G+": "பூ", "A+": "யூ", "T+": "வூ", Sh: "ளூ",
  // டி / டீ have their own keys
  b: "டி", B: "டீ",
  // ர் as a single glyph, and ஸ்ரீ
  H: "ர்", "=": "ஸ்ரீ",
};

const VOWELS: Record<string, string> = {
  m: "அ", M: "ஆ", ",": "இ", "<": "ஈ", c: "உ", C: "ஊ", v: "எ", V: "ஏ", I: "ஐ", x: "ஒ", X: "ஓ", "/": "ஃ",
  ">": ",",
};

const PREFIX_SIGNS: Record<string, string> = { n: "ெ", N: "ே", i: "ை" };

/**
 * Bamini draws க் and ஷ side by side, but in Unicode க + ் + ஷ is the conjunct
 * க்ஷ, which fonts draw as one letter. A zero-width non-joiner between them
 * keeps the name looking as it was typed: க் then ஷ, not the joined letter.
 */
const ZWNJ = String.fromCharCode(0x200c);

/** Text as a search compares it: case and the invisible joiners left out, so a name matches however it was typed. */
export const searchText = (text: string) => text.replace(/\p{Cf}/gu, "").toLowerCase();
const SUFFIX_SIGNS: Record<string, string> = { h: "ா", p: "ி", P: "ீ", ";": "்" };

/** A sign typed before the consonant plus one typed after it make a single two-part vowel. */
const TWO_PART: Record<string, string> = { nh: "ொ", Nh: "ோ", ns: "ௌ" };

export function baminiToUnicode(input: string): string {
  let out = "";
  let i = 0;
  let pending = ""; // a prefix sign waiting for its consonant

  const flushPending = () => {
    // A prefix sign with no consonant after it was not a sign at all — keep the character.
    out += pending;
    pending = "";
  };

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1] ?? "";

    if (ch in PREFIX_SIGNS && !pending) {
      pending = ch;
      i += 1;
      continue;
    }

    // "xs" is ஔ; checked before the plain vowel "x".
    if (ch === "x" && next === "s") {
      flushPending();
      out += "ஔ";
      i += 2;
      continue;
    }

    // Bamini's ா glyph doubles as ர: followed by a pulli or an i-sign it is the consonant.
    const hAsRa = ch === "h" && (next === ";" || next === "p" || next === "P");
    const consonant = hAsRa ? "ர" : CONSONANTS[ch];

    if (consonant) {
      i += 1;
      if (consonant === "ஷ" && out.endsWith("க்")) out += ZWNJ;
      if (pending) {
        const after = input[i] ?? "";
        const twoPart = TWO_PART[pending + after];
        // "ns" is only ௌ when the s is not itself the start of the next syllable.
        const sStartsSyllable = after === "s" && (input[i + 1] ?? "") in { ...SUFFIX_SIGNS };
        if (twoPart && !(after === "h" && [";", "p", "P"].includes(input[i + 1] ?? "")) && !sStartsSyllable) {
          out += consonant + twoPart;
          i += 1;
        } else {
          out += consonant + PREFIX_SIGNS[pending];
        }
        pending = "";
        continue;
      }
      const sign = input[i] ?? "";
      // After a consonant, "h" is the ா sign unless it is itself acting as ர (see above).
      const signIsRa = sign === "h" && [";", "p", "P"].includes(input[i + 1] ?? "");
      if (sign in SUFFIX_SIGNS && !signIsRa) {
        out += consonant + SUFFIX_SIGNS[sign];
        i += 1;
      } else {
        out += consonant;
      }
      continue;
    }

    const two = ch + next;
    if (two in SYLLABLES) {
      flushPending();
      out += SYLLABLES[two];
      i += 2;
      continue;
    }
    if (ch in SYLLABLES) {
      flushPending();
      out += SYLLABLES[ch];
      i += 1;
      continue;
    }
    if (ch in VOWELS) {
      flushPending();
      out += VOWELS[ch];
      i += 1;
      continue;
    }

    flushPending();
    out += ch;
    i += 1;
  }
  flushPending();
  return out;
}

/* ------------------------------------------------------------------ typing */

/** Keys that mean nothing until the next one arrives: a sign typed before its consonant, and "h", which is ா or the start of ர். */
const WAITING_SIGNS: Record<string, string> = { ...PREFIX_SIGNS, h: "ா" };

/** While a word is still being typed, a key waiting for the next one is shown as its sign, as the Bamini font draws it. */
function baminiWhileTyping(raw: string): string {
  const out = baminiToUnicode(raw);
  const last = raw.at(-1) ?? "";
  return last in WAITING_SIGNS && out.endsWith(last) ? out.slice(0, -1) + WAITING_SIGNS[last] : out;
}

const flip = (table: Record<string, string>) => Object.fromEntries(Object.entries(table).map(([key, tamil]) => [tamil, key]));
// Reversed first, so that where two keys draw the same letter (ஷ) the first one listed is the one used.
const KEY_OF_CONSONANT: Record<string, string> = flip(Object.fromEntries(Object.entries(CONSONANTS).reverse()));
const KEY_OF_WAITING_SIGN: Record<string, string> = flip(WAITING_SIGNS);
/** கு, நு… — the first key of a two-key letter such as நூ ("E}") has to be found again when typing carries on. */
const KEY_OF_SYLLABLE: Record<string, string> = flip(Object.fromEntries(Object.entries(SYLLABLES).filter(([key]) => key.length === 1)));
const KEYS_OF_SIGN: Record<string, [before: string, after: string]> = {
  "ா": ["", "h"], "ி": ["", "p"], "ீ": ["", "P"], "்": ["", ";"],
  "ெ": ["n", ""], "ே": ["N", ""], "ை": ["i", ""], "ொ": ["n", "h"], "ோ": ["N", "h"], "ௌ": ["n", "s"],
};

/**
 * The keys that would type the last syllable of text that is already Tamil, so
 * typing can carry on from it: a sign added to a letter that is already in the
 * box has to join that letter. Null when the text does not end in a syllable
 * this can retype (then the next key simply starts fresh).
 */
function lastSyllableAsBamini(text: string): { length: number; keys: string } | null {
  const last = text.at(-1) ?? "";
  const before = text.at(-2) ?? "";
  if (last in KEY_OF_CONSONANT) return { length: 1, keys: KEY_OF_CONSONANT[last] };
  if (before + last in KEY_OF_SYLLABLE) return { length: 2, keys: KEY_OF_SYLLABLE[before + last] };
  // A sign with no consonant under it is one that was still waiting when the typing was interrupted.
  if (last in KEY_OF_WAITING_SIGN && !(before in KEY_OF_CONSONANT)) return { length: 1, keys: KEY_OF_WAITING_SIGN[last] };
  const sign = KEYS_OF_SIGN[last];
  return sign && before in KEY_OF_CONSONANT ? { length: 2, keys: sign[0] + KEY_OF_CONSONANT[before] + sign[1] } : null;
}

/**
 * A stretch of keys typed in one go: `raw` is what was pressed and `out` what
 * the box shows for it, from `start`. It is kept because a key cannot be read
 * on its own — "n", "f", "h" are one syllable, கொ.
 */
export type BaminiRun = { start: number; raw: string; out: string };
export type BaminiTyped = { value: string; caret: number; run: BaminiRun | null };

/** The run still describes what sits just before the caret (nobody clicked elsewhere or edited the text since). */
const runIsLive = (value: string, start: number, end: number, run: BaminiRun | null): run is BaminiRun =>
  !!run && start === end && run.start + run.out.length === start && value.slice(run.start, start) === run.out;

/** Keys typed (or text pasted) over the selection `start`–`end` of a text box holding `value`. */
export function typeBamini(value: string, start: number, end: number, keys: string, run: BaminiRun | null): BaminiTyped {
  let from = start;
  let raw = keys;
  if (runIsLive(value, start, end, run)) {
    from = run.start;
    raw = run.raw + keys;
  } else {
    const syllable = lastSyllableAsBamini(value.slice(0, start));
    if (syllable) {
      from = start - syllable.length;
      raw = syllable.keys + keys;
    }
  }
  const out = baminiWhileTyping(raw);
  return { value: value.slice(0, from) + out + value.slice(end), caret: from + out.length, run: { start: from, raw, out } };
}

/** Backspace straight after typing takes back the last key, not the last Unicode character. Null = leave it to the browser. */
export function backspaceBamini(value: string, start: number, end: number, run: BaminiRun | null): BaminiTyped | null {
  if (!runIsLive(value, start, end, run)) return null;
  const raw = run.raw.slice(0, -1);
  const out = baminiWhileTyping(raw);
  return { value: value.slice(0, run.start) + out + value.slice(end), caret: run.start + out.length, run: raw ? { start: run.start, raw, out } : null };
}

/**
 * Whether a cell looks like Bamini rather than real text. Bamini Tamil is full
 * of pulli marks, which are typed as semicolons — something a name written in
 * English, or already in Unicode Tamil, essentially never contains.
 */
export function looksLikeBamini(text: string): boolean {
  if (/[஀-௿]/.test(text)) return false;
  return /[A-Za-z]/.test(text) && text.includes(";");
}
