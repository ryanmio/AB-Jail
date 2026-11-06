import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { landingUrlBase, publicMessageText } from "./public-links.ts";

describe("landingUrlBase", () => {
  it("keeps scheme, host and path only", () => {
    assert.equal(
      landingUrlBase("https://secure.actblue.com/donate/loc_rsaf_fr_crockett-senate-split_q42025?source=x&t=OGahJX&refcodeSB=b-259993-OGahJX"),
      "https://secure.actblue.com/donate/loc_rsaf_fr_crockett-senate-split_q42025"
    );
    assert.equal(landingUrlBase("https://secure.actblue.com/donate/page#top"), "https://secure.actblue.com/donate/page");
    assert.equal(landingUrlBase("https://secure.actblue.com/donate/page"), "https://secure.actblue.com/donate/page");
  });

  it("drops parameters written into the path", () => {
    assert.equal(landingUrlBase("https://secure.actblue.com/donate/page;refcode=a"), "https://secure.actblue.com/donate/page");
    assert.equal(landingUrlBase("https://secure.actblue.com/donate/page&refcode=a"), "https://secure.actblue.com/donate/page");
  });

  it("returns null for other hosts, empty or unparseable values", () => {
    assert.equal(landingUrlBase("https://p-af.org/b66/OGahJX?x=1"), null);
    assert.equal(landingUrlBase(null), null);
    assert.equal(landingUrlBase(undefined), null);
    assert.equal(landingUrlBase(""), null);
    assert.equal(landingUrlBase("not a url"), null);
    assert.equal(landingUrlBase("mailto:someone@example.com"), null);
  });
});

describe("publicMessageText", () => {
  const kept = [
    "secure.actblue.com/donate/dcrowley-email",
    "https://secure.actblue.com/donate/dcrowley-email",
    "secure.actblue.com/donate/ms_2024_q4",
    "https://abjail.org/api/cases/0653c5f0-f00d-466f-a905-070019ec310e/email-html",
  ];
  for (const link of kept) {
    it(`shows ${link} as written`, () => {
      assert.equal(publicMessageText(`Go ${link} now`), `Go ${link} now`);
    });
  }

  const replaced = [
    "secure.actblue.com/donate/page?refcode=abc",
    "secure.actblue.com/donate/page&refcode=abc",
    "secure.actblue.com/donate/page;refcode=abc",
    "secure.actblue.com/donate/page%3Frefcode%3Dabc",
    "https://secure.actblue.com/donate/page#top",
    "https://abjail.org/cases/abc?x=1",
    "rs-act.com/l/OGahJX",
    "rs-act.com?t=abc",
    "www.rs-act.com?t=abc",
    "bit.ly/4jYRCR9",
    "abigailspanberger.us/respectfully?t=EXWIxw",
    "turnoutpac.org/postcards",
    "dlcc.org/privacy-policy/",
    "flds.us/1124-2",
    "https://example.com",
    "ttps://rs-act.com/l/OGahJX",
    "http:/rs-act.com/l/OGahJX",
    "//rs-act.com/l/OGahJX",
  ];
  for (const link of replaced) {
    it(`replaces ${link}`, () => {
      assert.equal(publicMessageText(`Go ${link} now`), "Go [LINK] now");
    });
  }

  it("replaces links right after other characters", () => {
    assert.equal(publicMessageText("--rs-act.com/l/OGahJX x=rs-act.com/l/x"), "--[LINK] x=[LINK]");
    assert.equal(publicMessageText("mailto:list@sp.actionkit.com?subject=unsubscribe%3Aabc"), "mailto:list@[LINK]");
  });

  it("handles links inside an href attribute and as anchor text", () => {
    const text = 'See <a href="https://demsdefenddemocracy.com/l/YDsouu">demsdefenddemocracy.com/l/YDsouu</a> and <a href="https://abjail.org/cases/abc">abjail.org/cases/abc</a>';
    assert.equal(
      publicMessageText(text),
      'See <a href="[LINK]">[LINK]</a> and <a href="https://abjail.org/cases/abc">abjail.org/cases/abc</a>'
    );
  });

  it("preserves trailing punctuation", () => {
    const text = "A: bit.ly/4jYRCR9, B: p-af.org/b66?t=EfYDhh; C (flds.us/1124-2). D secure.actblue.com/donate/x&recurring=true]";
    assert.equal(publicMessageText(text), "A: [LINK], B: [LINK]; C ([LINK]). D [LINK]]");
  });

  it("leaves ordinary text and plain domain names alone", () => {
    const text = "Give $25/month before 5/10 at 10:30pm. Email info@example.com or visit ActBlue.com. Rated 4.5/5 by U.S./Canada readers.";
    assert.equal(publicMessageText(text), text);
  });

  it("passes through empty values", () => {
    assert.equal(publicMessageText(null), null);
    assert.equal(publicMessageText(undefined), null);
    assert.equal(publicMessageText(""), "");
  });
});
