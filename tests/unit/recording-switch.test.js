// Kill switch for session recording: only listed users, only with B2 keys set.
import { isRecorded } from "../../src/routes/recording.js";

describe("isRecorded", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  test("off when RECORD_USERS is empty", () => {
    process.env.RECORD_USERS = "";
    process.env.B2_KEY_ID = "k"; process.env.B2_APP_KEY = "s";
    expect(isRecorded("tr@example.com")).toBe(false);
  });

  test("off without B2 keys, even for a listed user", () => {
    process.env.RECORD_USERS = "tr@example.com";
    delete process.env.B2_KEY_ID; delete process.env.B2_APP_KEY;
    expect(isRecorded("tr@example.com")).toBe(false);
  });

  test("only listed users, case-insensitive", () => {
    process.env.RECORD_USERS = " TR@example.com , other@example.com";
    process.env.B2_KEY_ID = "k"; process.env.B2_APP_KEY = "s";
    expect(isRecorded("tr@EXAMPLE.com")).toBe(true);
    expect(isRecorded("admin@example.com")).toBe(false);
    expect(isRecorded("")).toBe(false);
  });
});
