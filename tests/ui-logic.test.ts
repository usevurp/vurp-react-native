import { describe, expect, it } from "vitest";
import { parseNotification } from "../src/core/notifications";
import { htmlToBlocks, htmlToText } from "../src/ui/html";
import { buildTheme, readableOn, resolveDark } from "../src/ui/theme";
import type { WidgetConfig } from "../src/core/types";

describe("FAQ answers", () => {
  it("turn paragraphs, lists and inline formatting into native blocks", () => {
    const blocks = htmlToBlocks(
      '<p>Orders ship in <strong>2 days</strong>.</p><ul><li>Track it <a href="https://acme.com/track">here</a></li><li>Or <em>call</em> us</li></ul><ol><li>One</li><li>Two</li></ol>',
    );
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        runs: [{ text: "Orders ship in " }, { text: "2 days", bold: true }, { text: "." }],
      },
      { kind: "bullet", runs: [{ text: "Track it " }, { text: "here", href: "https://acme.com/track" }] },
      { kind: "bullet", runs: [{ text: "Or " }, { text: "call", italic: true }, { text: " us" }] },
      { kind: "number", index: 1, runs: [{ text: "One" }] },
      { kind: "number", index: 2, runs: [{ text: "Two" }] },
    ]);
  });

  it("decode entities, keep line breaks, and never make unsafe links tappable", () => {
    const [block] = htmlToBlocks(
      '<p>Fish &amp; chips&nbsp;&#8212; <a href="javascript:alert(1)">x</a><br>next</p>',
    );
    expect(block!.runs.map((r) => r.text).join("")).toBe("Fish & chips — x\nnext");
    expect(block!.runs.find((r) => r.text === "x")).not.toHaveProperty("href");
    expect(htmlToText("<p>a</p><p></p><p>b</p>")).toBe("a\nb");
  });
});

describe("theme", () => {
  const config = { brandColor: "#FACC15", theme: "dark" } as WidgetConfig;

  it("picks readable text for the brand colour", () => {
    expect(readableOn("#635BFF")).toBe("#FFFFFF");
    expect(readableOn("#FACC15")).toBe("#18181B");
  });

  it("starts from the dashboard and lets the app override anything, per mode", () => {
    expect(buildTheme(config, true)).toMatchObject({
      brand: "#FACC15",
      onBrand: "#18181B",
      background: "#18181B",
    });
    const custom = buildTheme(config, true, { brand: "#0F766E", radius: 8, dark: { background: "#000000" } });
    expect(custom).toMatchObject({ brand: "#0F766E", onBrand: "#FFFFFF", radius: 8, background: "#000000" });
    expect(buildTheme(config, false, { dark: { background: "#000000" } }).background).toBe("#FFFFFF");
  });

  it("follows the dashboard, the phone, or a fixed choice", () => {
    expect(resolveDark("dashboard", config, "light")).toBe(true);
    expect(resolveDark("system", config, "light")).toBe(false);
    expect(resolveDark("light", config, "dark")).toBe(false);
  });
});

describe("notifications", () => {
  it("read Vurp's fields from any push library's data", () => {
    const data = { vurp: "reply", conversationId: "c1", messageId: "m1", projectId: "proj_x" };
    expect(parseNotification(data)).toEqual({ conversationId: "c1", messageId: "m1", projectId: "proj_x" });
    expect(parseNotification({ title: "Sale!" })).toBeNull();
    expect(parseNotification(null)).toBeNull();
  });
});
