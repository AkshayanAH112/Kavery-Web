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

/**
 * Whether a cell looks like Bamini rather than real text. Bamini Tamil is full
 * of pulli marks, which are typed as semicolons — something a name written in
 * English, or already in Unicode Tamil, essentially never contains.
 */
export function looksLikeBamini(text: string): boolean {
  if (/[஀-௿]/.test(text)) return false;
  return /[A-Za-z]/.test(text) && text.includes(";");
}
