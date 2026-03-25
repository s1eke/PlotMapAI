const FALLBACK_ENCODINGS = ["utf-8", "gbk", "big5", "gb18030", "utf-16le", "utf-16be"] as const;

export function detectAndConvert(rawBytes: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(rawBytes);

  if (bytes.length === 0) {
    return { text: "", encoding: "utf-8" };
  }

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.slice(3)), encoding: "utf-8-bom" };
  }

  if (
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    return { text: new TextDecoder("utf-16").decode(bytes), encoding: "utf-16" };
  }

  for (const enc of FALLBACK_ENCODINGS) {
    try {
      const decoder = new TextDecoder(enc, { fatal: true });
      const text = decoder.decode(bytes);

      if (enc.startsWith("utf-16")) {
        const asciiCountBytes = bytes.reduce((n, b) => n + (b < 128 ? 1 : 0), 0);
        const asciiCountText = [...text].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 0), 0);

        if (bytes.length > 0 && asciiCountBytes / bytes.length > 0.2) {
          if (text.length > 0 && asciiCountText / text.length < 0.05) {
            continue;
          }
        }

        if (text.includes("\u0000") || text.includes("\ufffd")) {
          continue;
        }
      }

      if (enc === "big5" && text.includes("\ufffd")) {
        continue;
      }

      return { text, encoding: enc };
    } catch {
      continue;
    }
  }

  const fallback = new TextDecoder("utf-8", { fatal: false });
  return { text: fallback.decode(bytes), encoding: "utf-8" };
}
