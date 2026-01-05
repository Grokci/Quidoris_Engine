import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../src/daemon/auth";

describe("auth password hashing", () => {
  test("verifyPassword returns true for correct password", () => {
    const h = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", h)).toBe(true);
  });

  test("verifyPassword returns false for incorrect password", () => {
    const h = hashPassword("secret");
    expect(verifyPassword("not-secret", h)).toBe(false);
  });
});
