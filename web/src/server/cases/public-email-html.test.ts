import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskListedIds, publicEmailHtml, publicEmailSubject } from "./public-email-html.ts";

describe("publicEmailHtml", () => {
  it("returns null or empty input unchanged", () => {
    assert.equal(publicEmailHtml(null), null);
    assert.equal(publicEmailHtml(undefined), null);
    assert.equal(publicEmailHtml(""), "");
  });

  it("drops image parameters and keeps the image", () => {
    assert.equal(
      publicEmailHtml('<img src="https://example.org/o.gif?akid=.12345.abcDEF&t=1" alt="">'),
      '<img src="https://example.org/o.gif" alt="">'
    );
    assert.equal(
      publicEmailHtml("<img src='https://cdn.example.org/pic.png?rdr=true' width=\"600\">"),
      "<img src='https://cdn.example.org/pic.png' width=\"600\">"
    );
    assert.equal(
      publicEmailHtml('<img src="https://substackcdn.com/image/fetch/w_600/https%3A%2F%2Fexample.org%2Fa.png">'),
      '<img src="https://substackcdn.com/image/fetch/w_600/https%3A%2F%2Fexample.org%2Fa.png">'
    );
    assert.equal(
      publicEmailHtml('<img srcset="https://a.org/x.png?v=1 1x, https://a.org/y.png?v=2 2x" src="//a.org/x.png?v=1">'),
      '<img srcset="https://a.org/x.png 1x, https://a.org/y.png 2x" src="//a.org/x.png">'
    );
    assert.equal(publicEmailHtml('<img src="data:image/gif;base64,R0lGODlh">'), '<img src="data:image/gif;base64,R0lGODlh">');
    assert.equal(publicEmailHtml('<img src="cid:part1@example">'), '<img src="cid:part1@example">');
  });

  it("removes images on pixel-only hosts", () => {
    assert.equal(publicEmailHtml('<p>a</p><img src="https://click.ngpvan.com/k/12345-ABCDE" /><p>b</p>'), "<p>a</p><p>b</p>");
    assert.equal(publicEmailHtml('<img src="https://links.e.example.org/eos/v1/TOKEN">'), "");
    assert.equal(publicEmailHtml('<img src="http://r20.rs6.net/on.jsp?ca=1&c=2&ch=3">'), "");
    assert.equal(publicEmailHtml('<img src="https://img.example.org/x.jpg">'), '<img src="https://img.example.org/x.jpg">');
  });

  it("keeps only plain ActBlue and AB Jail links", () => {
    assert.equal(
      publicEmailHtml('<a href="https://secure.actblue.com/donate/page?refcode=x&amp;akid=.12345.abcDEF">Give</a>'),
      '<a href="https://secure.actblue.com/donate/page">Give</a>'
    );
    assert.equal(
      publicEmailHtml('<a style="color:red"\n   href="https://example.org/go?nvep=ZmFrZQ%3D%3D"\n   target="_blank">Act now</a>'),
      '<a style="color:red"\n   target="_blank">Act now</a>'
    );
    assert.equal(publicEmailHtml("<a href=https://example.org/x>t</a>"), "<a>t</a>");
    assert.equal(publicEmailHtml("<a href='mailto:someone@example.org'>t</a>"), "<a>t</a>");
    assert.equal(publicEmailHtml('<a href="https://abjail.org/cases/1">c</a>'), '<a href="https://abjail.org/cases/1">c</a>');
  });

  it("handles links inside conditional comments", () => {
    const html =
      '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://example.org/go?akid=.12345.abcDEF" style="height:40px">' +
      '<center>Go</center></v:roundrect><![endif]-->';
    assert.equal(
      publicEmailHtml(html),
      '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:40px"><center>Go</center></v:roundrect><![endif]-->'
    );
  });

  it("drops parameters from style urls and background attributes", () => {
    assert.equal(
      publicEmailHtml('<style>.a{background:url("https://x.org/bg.png?e=abc")}</style><td background="https://x.org/bg.png?e=abc" style="background-image:url(https://x.org/i.png?e=1)">'),
      '<style>.a{background:url("https://x.org/bg.png")}</style><td background="https://x.org/bg.png" style="background-image:url(https://x.org/i.png)">'
    );
  });

  it("drops other remote attributes and event handlers", () => {
    assert.equal(
      publicEmailHtml('<a data-saferedirecturl="https://www.google.com/url?q=https://x.org" onclick=alert(1) class="b">t</a>'),
      '<a class="b">t</a>'
    );
    assert.equal(publicEmailHtml('<html xmlns="http://www.w3.org/1999/xhtml">'), '<html xmlns="http://www.w3.org/1999/xhtml">');
  });

  it("drops parameters from addresses outside attributes", () => {
    assert.equal(
      publicEmailHtml('<html xmlns="http://act.example.org/go/9?t=1&akid=.12345.abcDEF"><!-- https://example.org/go/1?akid=.12345.abcDEF --><p>https://example.org/x?nvep=ZmFrZQ==.</p>'),
      '<html xmlns="http://act.example.org/go/9"><!-- https://example.org/go/1 --><p>https://example.org/x</p>'
    );
  });

  it("leaves markup after an unclosed quote alone", () => {
    const html = '<a href="mailto:</a></p>\n<p>Carry on, we are counting on you <img src="https://img.example.org/a.png?e=1"></p>';
    assert.equal(publicEmailHtml(html), '<a href="mailto:</a></p>\n<p>Carry on, we are counting on you <img src="https://img.example.org/a.png"></p>');
  });

  it("handles a doubled closing quote", () => {
    assert.equal(
      publicEmailHtml('<a\n href="https://example.org/ss/c/TOKEN"" style="color:red">Go</a>'),
      '<a" style="color:red">Go</a>'
    );
  });

  it("masks labelled ids in text", () => {
    assert.equal(publicEmailHtml("<p>SUPPORTER ID: 99999999</p>"), "<p>SUPPORTER ID: ########</p>");
    assert.equal(publicEmailHtml("<p>Member #<b>12345</b></p>"), "<p>Member #<b>########</b></p>");
    assert.equal(publicEmailHtml("<p>Your voter ID card</p>"), "<p>Your voter ID card</p>");
  });

  it("masks listed ids as whole values only", () => {
    assert.equal(publicEmailHtml("<p>12345 and 9912345 and a12345</p>", ["12345"]), "<p>######## and 9912345 and a12345</p>");
    assert.equal(maskListedIds("x=12345&y=1", ["12345"]), "x=########&y=1");
  });
});

describe("publicEmailHtml fonts", () => {
  it("keeps font service addresses and stylesheet links", () => {
    const html =
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Lato:400,700&display=swap">' +
      '<link rel="stylesheet" href="https://example.org/style.css?v=2">' +
      '<style>@import url("https://fonts.googleapis.com/css2?family=Inter");@font-face{src:url(https://example.org/f.woff2?v=1)}</style>';
    assert.equal(
      publicEmailHtml(html),
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Lato:400,700&display=swap">' +
        '<link rel="stylesheet">' +
        '<style>@import url("https://fonts.googleapis.com/css2?family=Inter");@font-face{src:url(https://example.org/f.woff2)}</style>'
    );
  });

  it("keeps only font parameters on font hosts", () => {
    assert.equal(
      publicEmailHtml('<link href="https://fonts.googleapis.com/css?family=Lato:400&amp;link_id=0&amp;can_id=abc123&amp;display=swap#x">'),
      '<link href="https://fonts.googleapis.com/css?family=Lato:400&amp;display=swap">'
    );
    assert.equal(
      publicEmailHtml('<link href="https://fonts.googleapis.com/css?can_id=abc123">'),
      '<link href="https://fonts.googleapis.com/css">'
    );
  });
});

describe("publicEmailHtml timing", () => {
  const timed = (input: string) => {
    const start = performance.now();
    publicEmailHtml(input, ["12345"]);
    return performance.now() - start;
  };
  const LIMIT = 200;

  it("unclosed tag with many quotes", () => {
    assert.ok(timed("<a " + '" '.repeat(1000) + "x") < LIMIT);
    assert.ok(timed("<a " + '"x '.repeat(1000)) < LIMIT);
    assert.ok(timed('<a "x'.repeat(1000) + '"') < LIMIT);
    assert.ok(timed("<a" + " ".repeat(100000) + '"x"') < LIMIT);
  });

  it("long runs of slashes and addresses", () => {
    assert.ok(timed("/".repeat(200000)) < LIMIT);
    assert.ok(timed("//a".repeat(70000)) < LIMIT);
    assert.ok(timed("https://a".repeat(25000)) < LIMIT);
  });

  it("label followed by a long run of spaces and tags", () => {
    assert.ok(timed("Member ID: " + "&nbsp;<b></b>".repeat(4000) + " text") < LIMIT);
    assert.ok(timed("Member ID: ".repeat(5000) + "<b>".repeat(10000)) < LIMIT);
  });

  it("large ordinary email", () => {
    const row =
      '<tr><td style="padding:4px;font-family:Arial"><p>Hello there, Member ID: 12345</p>' +
      '<a href="https://example.org/go/1?akid=.12345.abcDEF" target="_blank">Act</a> ' +
      '<a href="https://secure.actblue.com/donate/p?refcode=x">Give</a>' +
      '<img src="https://img.example.org/a.png?rdr=true" width="600" alt="pic"></td></tr>\n';
    const html = "<html><body><table>" + row.repeat(Math.ceil(2_000_000 / row.length)) + "</table></body></html>";
    assert.ok(html.length > 2_000_000);
    assert.ok(timed(html) < LIMIT);
  });
});

describe("publicEmailSubject", () => {
  it("masks ids and leaves the rest", () => {
    assert.equal(publicEmailSubject("Donor ID 123456 - thanks", ["abc"]), "Donor ID ######## - thanks");
    assert.equal(publicEmailSubject("Re: abc", ["abc"]), "Re: ########");
    assert.equal(publicEmailSubject(null), null);
    assert.equal(publicEmailSubject(""), "");
  });
});
