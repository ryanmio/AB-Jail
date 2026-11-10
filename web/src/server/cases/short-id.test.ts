import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isShortCaseId, resolveCaseId, shortIdRange, type ShortIdRow } from "./short-id.ts";

const OLD = { id: "abcd1234-1111-4111-8111-111111111111", created_at: "2025-09-01T00:00:00+00:00" };
const NEW = { id: "abcd1234-0000-4000-8000-000000000000", created_at: "2026-03-01T00:00:00+00:00" };

function lookupOf(rows: ShortIdRow[]) {
  const calls: Array<[string, string]> = [];
  const lookup = async (lo: string, hi: string) => {
    calls.push([lo, hi]);
    return rows.filter((r) => r.id >= lo && r.id <= hi);
  };
  return { lookup, calls };
}

describe("isShortCaseId", () => {
  it("accepts exactly 8 hex characters", () => {
    assert.equal(isShortCaseId("abcd1234"), true);
    assert.equal(isShortCaseId("ABCD1234"), true);
    assert.equal(isShortCaseId("abcd123"), false);
    assert.equal(isShortCaseId("abcd12345"), false);
    assert.equal(isShortCaseId("abcd123g"), false);
    assert.equal(isShortCaseId(OLD.id), false);
  });
});

describe("shortIdRange", () => {
  it("spans every UUID with that prefix", () => {
    assert.deepEqual(shortIdRange("ABCD1234"), [
      "abcd1234-0000-0000-0000-000000000000",
      "abcd1234-ffff-ffff-ffff-ffffffffffff",
    ]);
  });
});

describe("resolveCaseId", () => {
  it("resolves a short ID with one match", async () => {
    const { lookup } = lookupOf([OLD, { id: "ffff0000-1111-4111-8111-111111111111", created_at: null }]);
    assert.equal(await resolveCaseId("abcd1234", lookup), OLD.id);
    assert.equal(await resolveCaseId("ABCD1234", lookup), OLD.id);
  });

  it("returns null when nothing matches", async () => {
    const { lookup } = lookupOf([OLD]);
    assert.equal(await resolveCaseId("00000000", lookup), null);
  });

  it("gives a shared short ID to the oldest case", async () => {
    assert.equal(await resolveCaseId("abcd1234", lookupOf([NEW, OLD]).lookup), OLD.id);
    assert.equal(await resolveCaseId("abcd1234", lookupOf([OLD, NEW]).lookup), OLD.id);
  });

  it("passes full UUIDs and other values through without a lookup", async () => {
    const { lookup, calls } = lookupOf([OLD]);
    assert.equal(await resolveCaseId(NEW.id, lookup), NEW.id);
    assert.equal(await resolveCaseId("not-an-id", lookup), "not-an-id");
    assert.equal(calls.length, 0);
  });
});
