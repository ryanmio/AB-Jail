import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmailHtml } from "./html-sanitizer.ts";

describe("sanitizeEmailHtml To: lines", () => {
  it("strips the name from a To: line", () => {
    assert.equal(
      sanitizeEmailHtml('To: Jane Doe &lt;<a href="mailto:jane@example.org">x</a>&gt;'),
      "To: x&gt;"
    );
    assert.equal(sanitizeEmailHtml("To: jane@example.org"), "To: *******@*******.org");
  });

  it("leaves words ending in to: alone", () => {
    const img = '<img src="https://substackcdn.com/image/fetch/w_36,q_auto:good,fl_progressive:steep/https%3A%2F%2Fexample.org%2Fa.png"></td>';
    assert.equal(sanitizeEmailHtml(img), img);
  });

  it("leaves text after to: that is not an address alone", () => {
    const footer = "<p>Mail contributions to: PO Box 123, Springfield<br>Paid for by Example PAC</p>";
    assert.equal(sanitizeEmailHtml(footer), footer);
  });
});
