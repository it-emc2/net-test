import { nameSearchRegex } from "../../src/utils/searchRegex.js";

describe("nameSearchRegex", () => {
  const slugified = "ANG-BU-Hans-Muller-06032026-161938";

  test("umlaut query finds the ASCII-slugified draft name", () => {
    expect(nameSearchRegex("Müller").test(slugified)).toBe(true);
    expect(nameSearchRegex("müller").test(slugified)).toBe(true);
    expect(nameSearchRegex("Muller").test(slugified)).toBe(true);
    expect(nameSearchRegex("Schöne").test("ANG-BU-Anna-Schone-1")).toBe(true);
    expect(nameSearchRegex("Bäder").test("ANG-BU-Bader-1")).toBe(true);
  });

  test("ASCII query still finds a name that kept its umlauts", () => {
    expect(nameSearchRegex("Muller").test("Kunde Müller")).toBe(true);
    expect(nameSearchRegex("Müller").test("Kunde Müller")).toBe(true);
  });

  test("does not match unrelated names and never throws on regex chars", () => {
    expect(nameSearchRegex("Meier").test(slugified)).toBe(false);
    expect(nameSearchRegex("(").test(slugified)).toBe(false);
  });
});
