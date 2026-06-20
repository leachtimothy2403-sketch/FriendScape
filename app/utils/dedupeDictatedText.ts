export function dedupeDictatedText(newText: string): string {
  const len = newText.length;
  if (len < 4) return newText;
  // Try splitting at every point from the middle outward, checking if the text
  // before the split point is repeated (even partially) after the split point.
  for (let splitPoint = Math.ceil(len / 2); splitPoint < len; splitPoint++) {
    const firstPart = newText.slice(0, splitPoint);
    const remainder = newText.slice(splitPoint);
    // If the remainder is a prefix of firstPart (i.e. the repeat got cut off, or
    // matches it exactly), the text is duplicated — keep only firstPart.
    if (remainder.length > 0 && firstPart.startsWith(remainder)) {
      return firstPart;
    }
  }
  return newText;
}
