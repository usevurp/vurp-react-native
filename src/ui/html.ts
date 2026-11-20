// FAQ answers are HTML written in the Vurp dashboard's editor (paragraphs, lists, bold, italic,
// links, line breaks). The messenger shows them as native text, without a WebView.

export type Run = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type Block = { kind: "paragraph" | "bullet" | "number"; index?: number; runs: Run[] };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

/** Only web links, mail and phone are made tappable. */
const safeHref = (href: string | undefined) =>
  href && /^(https?:|mailto:|tel:)/i.test(href.trim()) ? href.trim() : undefined;

export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const lists: { ordered: boolean; count: number }[] = [];
  let bold = 0;
  let italic = 0;
  const links: (string | undefined)[] = [];
  let current: Block | null = null;

  const block = () => {
    if (!current) {
      current = { kind: "paragraph", runs: [] };
      blocks.push(current);
    }
    return current;
  };
  const end = () => {
    current = null;
  };

  for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (!token.startsWith("<")) {
      // Collapse source whitespace first, so an intended &nbsp; survives.
      const text = decode(token.replace(/[ \t\r\n]+/g, " "));
      if (!text.trim() && !current) continue;
      block().runs.push({
        text,
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italic: true } : {}),
        ...(links.at(-1) ? { href: links.at(-1) } : {}),
      });
      continue;
    }
    const closing = token[1] === "/";
    const name = /^<\/?\s*([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase() ?? "";
    switch (name) {
      case "p":
      case "div":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "blockquote":
        end();
        if (!closing && name.startsWith("h")) bold++;
        if (closing && name.startsWith("h")) bold = Math.max(0, bold - 1);
        break;
      case "br":
        block().runs.push({ text: "\n" });
        break;
      case "ul":
      case "ol":
        end();
        if (closing) lists.pop();
        else lists.push({ ordered: name === "ol", count: 0 });
        break;
      case "li": {
        end();
        if (closing) break;
        const list = lists.at(-1);
        const item: Block = list?.ordered
          ? { kind: "number", index: ++list.count, runs: [] }
          : { kind: "bullet", runs: [] };
        blocks.push(item);
        current = item;
        break;
      }
      case "strong":
      case "b":
        bold = closing ? Math.max(0, bold - 1) : bold + 1;
        break;
      case "em":
      case "i":
        italic = closing ? Math.max(0, italic - 1) : italic + 1;
        break;
      case "a":
        if (closing) links.pop();
        else links.push(safeHref(/href\s*=\s*["']([^"']*)["']/i.exec(token)?.[1]));
        break;
    }
  }

  // Trim each block, and drop empty ones.
  return blocks
    .map((b) => {
      const runs = b.runs.filter((r) => r.text !== "");
      if (runs[0]) runs[0] = { ...runs[0], text: runs[0].text.trimStart() };
      const last = runs.at(-1);
      if (last) runs[runs.length - 1] = { ...last, text: last.text.trimEnd() };
      return { ...b, runs: runs.filter((r) => r.text !== "") };
    })
    .filter((b) => b.runs.length > 0);
}

/** The answer as plain text, for search. */
export const htmlToText = (html: string) =>
  htmlToBlocks(html)
    .map((b) => b.runs.map((r) => r.text).join(""))
    .join("\n");
