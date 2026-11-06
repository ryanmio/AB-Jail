import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanSenderName } from "./sender-name.ts";

describe("cleanSenderName", () => {
  it("drops bracketed text", () => {
    assert.equal(cleanSenderName("Democratic National Committee (DNC)"), "Democratic National Committee");
    assert.equal(cleanSenderName("DSCC (Democratic Senatorial Campaign Committee)"), "DSCC");
    assert.equal(cleanSenderName("Louisiana Democratic Party (Louisiana Democrats / DSCC of LA)"), "Louisiana Democratic Party");
  });

  it("straightens curly apostrophes", () => {
    assert.equal(cleanSenderName("Women’s March"), "Women's March");
    assert.equal(cleanSenderName("Women's March"), "Women's March");
  });

  it("collapses spaces and trims", () => {
    assert.equal(cleanSenderName("  House  Majority PAC "), "House Majority PAC");
  });

  it("leaves other names alone", () => {
    assert.equal(cleanSenderName("STOP TRUMP PAC"), "STOP TRUMP PAC");
    assert.equal(cleanSenderName("New. Digital. Now."), "New. Digital. Now.");
  });

  it("returns null when nothing is left", () => {
    assert.equal(cleanSenderName("(DNC)"), null);
    assert.equal(cleanSenderName("   "), null);
    assert.equal(cleanSenderName(null), null);
  });
});
