const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const raw = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(raw, isHex ? 16 : 10);
      if (!Number.isFinite(codePoint)) return whole;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

export function htmlToText(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<p\b[^>]*>/gi, "\n\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<li\s*>/gi, "\n- ")
      .replace(/<\/li\s*>/gi, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
