import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactStrings, visibleText } from "./redact-text.ts";

describe("redactStrings", () => {
  it("matches whole words only", () => {
    assert.equal(redactStrings("Ab, About this", ["Ab"]), "**, About this");
  });

  it("matches the capitalized form", () => {
    assert.equal(redactStrings("JANE DOE: respond", ["Jane Doe"]), "**** ***: respond");
  });

  it("matches across tags and spacing, keeping the tags", () => {
    assert.equal(redactStrings("x. <em>Jane</em>&nbsp;Doe", ["Jane Doe"]), "x. <em>****</em>&nbsp;***");
    assert.equal(redactStrings("Jane\nDoe", ["Jane Doe"]), "****\n***");
  });

  it("also redacts the string without trailing punctuation", () => {
    assert.equal(redactStrings("Jane, hi Jane", ["Jane,"]), "***** hi ****");
  });

  it("ignores strings with no letters or digits", () => {
    assert.equal(redactStrings("a -- b", ["--"]), "a -- b");
  });
});

describe("visibleText", () => {
  it("keeps words and button text, drops markup", () => {
    const html = `<html><head><style>.a{color:red}</style></head><body><p>Hi&nbsp;Jane,</p><a class="btn" href="https://x.test/?a=1">Donate&nbsp;&rarr;</a><img src="y.png" alt="Poll for Jane"></body></html>`;
    assert.equal(visibleText(html), "Hi Jane,\nDonate Poll for Jane");
  });
});
