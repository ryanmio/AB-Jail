import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { landingUrlBase, isPlainLink, publicMessageText } from "./public-links.ts";

describe("landingUrlBase", () => {
  it("keeps scheme, host and path only", () => {
    assert.equal(
      landingUrlBase("https://secure.actblue.com/donate/loc_rsaf_fr_crockett-senate-split_q42025?source=x&t=OGahJX&refcodeSB=b-259993-OGahJX"),
      "https://secure.actblue.com/donate/loc_rsaf_fr_crockett-senate-split_q42025"
    );
    assert.equal(landingUrlBase("https://secure.actblue.com/donate/page#top"), "https://secure.actblue.com/donate/page");
    assert.equal(landingUrlBase("https://secure.actblue.com/donate/page"), "https://secure.actblue.com/donate/page");
  });

  it("returns null for empty or unparseable values", () => {
    assert.equal(landingUrlBase(null), null);
    assert.equal(landingUrlBase(undefined), null);
    assert.equal(landingUrlBase(""), null);
    assert.equal(landingUrlBase("not a url"), null);
    assert.equal(landingUrlBase("mailto:someone@example.com"), null);
  });
});

describe("isPlainLink", () => {
  const plain = [
    "secure.actblue.com/donate/dcrowley-email",
    "https://secure.actblue.com/donate/dcrowley-email",
    "secure.actblue.com/donate/ms_2024_q4",
    "https://abjail.org/api/cases/0653c5f0-f00d-466f-a905-070019ec310e/email-html",
  ];
  for (const link of plain) {
    it(`shows ${link} as written`, () => {
      assert.equal(isPlainLink(link), true);
    });
  }

  const placeholder = [
    "secure.actblue.com/donate/page?refcode=abc",
    "https://secure.actblue.com/donate/page#top",
    "https://abjail.org/cases/abc?x=1",
    "rs-act.com/l/OGahJX",
    "bit.ly/4jYRCR9",
    "abigailspanberger.us/respectfully?t=EXWIxw",
    "turnoutpac.org/postcards",
    "dlcc.org/privacy-policy/",
    "flds.us/1124-2",
    "https://example.com",
  ];
  for (const link of placeholder) {
    it(`shows a placeholder for ${link}`, () => {
      assert.equal(isPlainLink(link), false);
    });
  }
});

describe("publicMessageText", () => {
  it("replaces links and keeps the rest of the text", () => {
    const text = "Chip in now: rs-act.com/l/OGahJX. Reply STOP to opt out.";
    assert.equal(publicMessageText(text), "Chip in now: [LINK]. Reply STOP to opt out.");
  });

  it("keeps ActBlue page links and replaces ActBlue links with parameters", () => {
    const text = "Donate https://secure.actblue.com/donate/page?refcode=x or secure.actblue.com/donate/dcrowley-email";
    assert.equal(publicMessageText(text), "Donate [LINK] or secure.actblue.com/donate/dcrowley-email");
  });

  it("replaces other links even when readable", () => {
    const text = "See turnoutpac.org/postcards and https://dlcc.org/privacy-policy/ today";
    assert.equal(publicMessageText(text), "See [LINK] and [LINK] today");
  });

  it("handles links inside an href attribute and as anchor text", () => {
    const text = 'See <a href="https://demsdefenddemocracy.com/l/YDsouu">demsdefenddemocracy.com/l/YDsouu</a> and <a href="https://abjail.org/cases/abc">abjail.org/cases/abc</a>';
    assert.equal(
      publicMessageText(text),
      'See <a href="[LINK]">[LINK]</a> and <a href="https://abjail.org/cases/abc">abjail.org/cases/abc</a>'
    );
  });

  it("preserves trailing punctuation", () => {
    const text = "A: bit.ly/4jYRCR9, B: p-af.org/b66?t=EfYDhh; C (flds.us/1124-2). Seen turnoutpac.org/postcards?";
    assert.equal(publicMessageText(text), "A: [LINK], B: [LINK]; C ([LINK]). Seen [LINK]?");
  });

  it("handles a link with parameters whose scheme is damaged", () => {
    const text = "Give: ttps://secure.actblue.com/donate/page/?refcode=abc now";
    assert.equal(publicMessageText(text), "Give: ttps://[LINK] now");
  });

  it("leaves ordinary text alone", () => {
    const text = "Give $25/month before 5/10 at 10:30pm. Email info@example.com. Rated 4.5/5 by U.S./Canada readers.";
    assert.equal(publicMessageText(text), text);
  });

  it("passes through empty values", () => {
    assert.equal(publicMessageText(null), null);
    assert.equal(publicMessageText(undefined), null);
    assert.equal(publicMessageText(""), "");
  });
});
