/**
 * pdfSafeText.ts — plain-text sanitization for jsPDF's default WinAnsi
 * Helvetica, which renders unsupported Unicode as mojibake/tofu rather than
 * failing loudly.
 *
 * Deliberately dependency-free (no `jspdf` import). Every PDF-writing module
 * imports THIS file rather than the general `pdfExport.ts`, so a small text
 * helper does not drag the whole PDF-building module — and its `jspdf`
 * dependency — into a chunk that was meant to stay lazily loaded.
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Dj', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y',
  Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'C',
  У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Џ: 'Dz', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y', Ь: '',
  Э: 'E', Ю: 'Yu', Я: 'Ya', Є: 'Ye', І: 'I', Ї: 'Yi', Ґ: 'G',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', џ: 'dz', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', є: 'ye', і: 'i', ї: 'yi', ґ: 'g',
};

export function toPdfSafeText(value: string): string {
  const transliterated = Array.from(value.normalize('NFKD'))
    .filter((character) => !/[\u0300-\u036f]/.test(character))
    .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
    .join('');
  return transliterated
    .replaceAll('→', ' -> ')
    .replaceAll('←', ' <- ')
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('·', ' / ')
    .replaceAll('’', "'")
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replace(/[^\x20-\x7E°]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}
