// Arabic text shaping for PDF output.
//
// jsPDF renders glyphs left-to-right and performs NO Arabic contextual shaping
// or bidi reordering. Without help, Arabic comes out as disconnected isolated
// letters in visual LTR order — i.e. unreadable. This module converts a logical
// Arabic string into a *visually ordered* string of Unicode presentation forms
// (block FExx) so it can be drawn as-is.
//
// Two steps:
//   1. Contextual shaping   — pick isolated / initial / medial / final glyph per
//      letter from its neighbours' joining behaviour, plus LAM-ALEF ligatures.
//   2. Simplified bidi       — reverse the shaped run for RTL, while keeping
//      embedded Latin/number runs in their natural left-to-right order.
//
// This covers report content well (titles, names, labels, dates, mixed digits).
// It is intentionally a pragmatic subset of the full UAX #9 bidi algorithm.

type Joining = "D" | "R" | "U"; // Dual, Right, non-joining (transparent handled separately)

type Letter = {
  isol: number;
  init: number | null;
  medi: number | null;
  fina: number | null;
  join: Joining;
};

// Base Arabic letter (U+0621–U+064A) → its presentation forms in block FE70–FEFF.
// Right-joining letters (alef, dal, reh, waw, …) only have isolated + final forms.
const LETTERS: Record<number, Letter> = {
  0x0621: { isol: 0xfe80, init: null, medi: null, fina: null, join: "U" }, // hamza
  0x0622: { isol: 0xfe81, init: null, medi: null, fina: 0xfe82, join: "R" }, // alef madda
  0x0623: { isol: 0xfe83, init: null, medi: null, fina: 0xfe84, join: "R" }, // alef hamza above
  0x0624: { isol: 0xfe85, init: null, medi: null, fina: 0xfe86, join: "R" }, // waw hamza
  0x0625: { isol: 0xfe87, init: null, medi: null, fina: 0xfe88, join: "R" }, // alef hamza below
  0x0626: { isol: 0xfe89, init: 0xfe8b, medi: 0xfe8c, fina: 0xfe8a, join: "D" }, // yeh hamza
  0x0627: { isol: 0xfe8d, init: null, medi: null, fina: 0xfe8e, join: "R" }, // alef
  0x0628: { isol: 0xfe8f, init: 0xfe91, medi: 0xfe92, fina: 0xfe90, join: "D" }, // beh
  0x0629: { isol: 0xfe93, init: null, medi: null, fina: 0xfe94, join: "R" }, // teh marbuta
  0x062a: { isol: 0xfe95, init: 0xfe97, medi: 0xfe98, fina: 0xfe96, join: "D" }, // teh
  0x062b: { isol: 0xfe99, init: 0xfe9b, medi: 0xfe9c, fina: 0xfe9a, join: "D" }, // theh
  0x062c: { isol: 0xfe9d, init: 0xfe9f, medi: 0xfea0, fina: 0xfe9e, join: "D" }, // jeem
  0x062d: { isol: 0xfea1, init: 0xfea3, medi: 0xfea4, fina: 0xfea2, join: "D" }, // hah
  0x062e: { isol: 0xfea5, init: 0xfea7, medi: 0xfea8, fina: 0xfea6, join: "D" }, // khah
  0x062f: { isol: 0xfea9, init: null, medi: null, fina: 0xfeaa, join: "R" }, // dal
  0x0630: { isol: 0xfeab, init: null, medi: null, fina: 0xfeac, join: "R" }, // thal
  0x0631: { isol: 0xfead, init: null, medi: null, fina: 0xfeae, join: "R" }, // reh
  0x0632: { isol: 0xfeaf, init: null, medi: null, fina: 0xfeb0, join: "R" }, // zain
  0x0633: { isol: 0xfeb1, init: 0xfeb3, medi: 0xfeb4, fina: 0xfeb2, join: "D" }, // seen
  0x0634: { isol: 0xfeb5, init: 0xfeb7, medi: 0xfeb8, fina: 0xfeb6, join: "D" }, // sheen
  0x0635: { isol: 0xfeb9, init: 0xfebb, medi: 0xfebc, fina: 0xfeba, join: "D" }, // sad
  0x0636: { isol: 0xfebd, init: 0xfebf, medi: 0xfec0, fina: 0xfebe, join: "D" }, // dad
  0x0637: { isol: 0xfec1, init: 0xfec3, medi: 0xfec4, fina: 0xfec2, join: "D" }, // tah
  0x0638: { isol: 0xfec5, init: 0xfec7, medi: 0xfec8, fina: 0xfec6, join: "D" }, // zah
  0x0639: { isol: 0xfec9, init: 0xfecb, medi: 0xfecc, fina: 0xfeca, join: "D" }, // ain
  0x063a: { isol: 0xfecd, init: 0xfecf, medi: 0xfed0, fina: 0xfece, join: "D" }, // ghain
  0x0641: { isol: 0xfed1, init: 0xfed3, medi: 0xfed4, fina: 0xfed2, join: "D" }, // feh
  0x0642: { isol: 0xfed5, init: 0xfed7, medi: 0xfed8, fina: 0xfed6, join: "D" }, // qaf
  0x0643: { isol: 0xfed9, init: 0xfedb, medi: 0xfedc, fina: 0xfeda, join: "D" }, // kaf
  0x0644: { isol: 0xfedd, init: 0xfedf, medi: 0xfee0, fina: 0xfede, join: "D" }, // lam
  0x0645: { isol: 0xfee1, init: 0xfee3, medi: 0xfee4, fina: 0xfee2, join: "D" }, // meem
  0x0646: { isol: 0xfee5, init: 0xfee7, medi: 0xfee8, fina: 0xfee6, join: "D" }, // noon
  0x0647: { isol: 0xfee9, init: 0xfeeb, medi: 0xfeec, fina: 0xfeea, join: "D" }, // heh
  0x0648: { isol: 0xfeed, init: null, medi: null, fina: 0xfeee, join: "R" }, // waw
  0x0649: { isol: 0xfeef, init: null, medi: null, fina: 0xfef0, join: "R" }, // alef maksura
  0x064a: { isol: 0xfef1, init: 0xfef3, medi: 0xfef4, fina: 0xfef2, join: "D" }, // yeh
};

// LAM (0644) followed by an alef variant merges into a single ligature glyph.
// [isolated, final] forms of the ligature.
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6], // lam + alef madda
  0x0623: [0xfef7, 0xfef8], // lam + alef hamza above
  0x0625: [0xfef9, 0xfefa], // lam + alef hamza below
  0x0627: [0xfefb, 0xfefc], // lam + plain alef
};

// Combining Arabic marks (harakat) — transparent to joining. Range covers the
// common tashkeel; they are dropped for shaping (jsPDF positions them poorly and
// reports rarely carry vowel marks).
function isTransparent(cp: number): boolean {
  return (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670 || cp === 0x0640; // marks + tatweel
}

export function isArabicChar(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
    (cp >= 0xfb50 && cp <= 0xfdff) || // Presentation Forms-A
    (cp >= 0xfe70 && cp <= 0xfeff) // Presentation Forms-B
  );
}

/** True if the string contains any Arabic-script character. */
export function hasArabic(s: string): boolean {
  for (const ch of s) if (isArabicChar(ch.codePointAt(0)!)) return true;
  return false;
}

// A shaped token carries its glyph plus a direction so bidi can reorder runs.
type Token = { ch: string; rtl: boolean };

/** Can this letter connect to a following letter (to its left)? */
function joinsAfter(l: Letter | undefined): boolean {
  return l?.join === "D";
}
/** Can this letter connect to a preceding letter (to its right)? */
function joinsBefore(l: Letter | undefined): boolean {
  return l?.join === "D" || l?.join === "R";
}

/**
 * Shape a logical Arabic string into a visually ordered presentation-form
 * string ready to hand to jsPDF. Non-Arabic characters (Latin, digits,
 * punctuation) are preserved and kept left-to-right within the RTL flow.
 */
export function shapeArabic(input: string): string {
  // 1. Collapse to base letters (dropping transparent marks) while remembering
  //    original non-letter characters in sequence.
  const cps = [...input].map((c) => c.codePointAt(0)!).filter((cp) => !isTransparent(cp));

  const tokens: Token[] = [];

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];

    // LAM-ALEF ligature: consume the alef too.
    if (cp === 0x0644 && i + 1 < cps.length && LAM_ALEF[cps[i + 1]]) {
      const [iso, fin] = LAM_ALEF[cps[i + 1]];
      // The ligature joins backwards if the char before the lam connects forward.
      const prev = LETTERS[cps[i - 1]];
      const joinBack = joinsAfter(prev);
      tokens.push({ ch: String.fromCodePoint(joinBack ? fin : iso), rtl: true });
      i++; // skip the alef
      continue;
    }

    const letter = LETTERS[cp];
    if (!letter) {
      // Non-shaping character (Latin, digit, space, punctuation, or Arabic
      // punctuation like ، ؟). Mark digits/Latin as LTR so bidi keeps them
      // readable; treat Arabic punctuation as RTL.
      tokens.push({ ch: String.fromCodePoint(cp), rtl: isArabicChar(cp) });
      continue;
    }

    const prev = LETTERS[cps[i - 1]];
    const next = LETTERS[cps[i + 1]];
    const linkPrev = joinsBefore(letter) && joinsAfter(prev);
    const linkNext = joinsAfter(letter) && joinsBefore(next);

    let glyph: number;
    if (linkPrev && linkNext) glyph = letter.medi ?? letter.isol;
    else if (linkNext) glyph = letter.init ?? letter.isol;
    else if (linkPrev) glyph = letter.fina ?? letter.isol;
    else glyph = letter.isol;

    tokens.push({ ch: String.fromCodePoint(glyph), rtl: true });
  }

  // 2. Simplified bidi: reverse the whole run, then flip back each maximal LTR
  //    sub-run so Latin words and numbers read correctly.
  tokens.reverse();
  const out: Token[] = [];
  let j = 0;
  while (j < tokens.length) {
    if (tokens[j].rtl) {
      out.push(tokens[j]);
      j++;
    } else {
      let k = j;
      while (k < tokens.length && !tokens[k].rtl) k++;
      const ltr = tokens.slice(j, k).reverse(); // undo the global reverse for this run
      out.push(...ltr);
      j = k;
    }
  }

  return out.map((t) => t.ch).join("");
}

/**
 * Prepare arbitrary text for drawing in a given locale. For Arabic locales the
 * string is shaped + reordered; other locales pass through untouched.
 */
export function shapeForLocale(text: string, locale: string): string {
  if (locale !== "ar") return text;
  if (!hasArabic(text)) return text;
  return shapeArabic(text);
}
