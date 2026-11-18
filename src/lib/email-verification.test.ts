import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

mkdirSync(resolve(".tmp-validation"), { recursive: true });
const folder = mkdtempSync(resolve(".tmp-validation/email-verification-"));
process.env.DATABASE_PATH = join(folder, "users.sqlite");
const legacy = new DatabaseSync(process.env.DATABASE_PATH);
legacy.exec(`CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, partner_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  role TEXT NOT NULL DEFAULT 'client', created_at TEXT NOT NULL,
  reviewed_at TEXT, last_login_at TEXT
);
INSERT INTO users (name, email, partner_name, password_hash, status, created_at)
VALUES ('Existing User', 'existing@example.com', '', 'fixture', 'approved', '2026-11-18');`);
legacy.close();

const {
  findUserByEmail,
  createPendingUser,
  reserveEmailVerification,
  confirmEmailVerification,
  expireEmailVerification,
  updateUserDetails,
  updateUserStatus,
  deleteUser,
} = await import("./database.server.ts");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

function newUser(email: string) {
  createPendingUser({ name: "Test User", email, partnerName: "", passwordHash: "fixture" });
  return findUserByEmail(email)!;
}

test("migrates existing accounts without manufacturing email confirmation", () => {
  const user = findUserByEmail("existing@example.com")!;
  assert.equal(user.status, "approved");
  assert.equal(user.emailVerifiedAt, null);
});

test("confirmation is single-use and keeps administrator approval separate", () => {
  const user = newUser("single@example.com");
  const hash = tokenHash("single-use-token");
  assert.equal(reserveEmailVerification(user, hash, 100_000), true);
  assert.equal(confirmEmailVerification(hash, 100_001), true);
  assert.equal(confirmEmailVerification(hash, 100_002), false);
  const confirmed = findUserByEmail(user.email)!;
  assert.equal(confirmed.emailVerifiedAt, new Date(100_001).toISOString());
  assert.equal(confirmed.status, "pending");
});

test("expiration, resend cooldown, and superseded links are enforced", () => {
  const user = newUser("resend@example.com");
  const first = tokenHash("first");
  const second = tokenHash("second");
  assert.equal(reserveEmailVerification(user, first, 1_000_000), true);
  assert.equal(reserveEmailVerification(user, second, 1_059_999), false);
  assert.equal(reserveEmailVerification(user, second, 1_060_000), true);
  assert.equal(confirmEmailVerification(first, 1_060_001), false);
  assert.equal(confirmEmailVerification(second, 4_660_000), false);
});

test("delivery failure invalidates the token and keeps resend limits", () => {
  const user = newUser("failed@example.com");
  const hash = tokenHash("failed-delivery");
  assert.equal(reserveEmailVerification(user, hash, 2_000_000), true);
  expireEmailVerification(hash);
  assert.equal(confirmEmailVerification(hash, 2_000_001), false);
  assert.equal(reserveEmailVerification(user, tokenHash("retry"), 2_000_002), false);
  assert.equal(reserveEmailVerification(user, tokenHash("retry"), 2_060_000), true);
});

test("daily limits survive resends and reset after 24 hours", () => {
  const user = newUser("daily@example.com");
  for (let index = 0; index < 10; index++) {
    assert.equal(
      reserveEmailVerification(user, tokenHash(`daily-${index}`), 1_000_000 + index * 60_000),
      true,
    );
  }
  assert.equal(reserveEmailVerification(user, tokenHash("eleventh"), 1_600_000), false);
  assert.equal(reserveEmailVerification(user, tokenHash("next-day"), 87_400_000), true);
});

test("changing email resets verification and invalidates old links", () => {
  const user = newUser("old@example.com");
  assert.equal(reserveEmailVerification(user, tokenHash("old"), 3_000_000), true);
  assert.equal(
    updateUserDetails(user.id, { name: user.name, email: "new@example.com", partnerName: "" }),
    "updated",
  );
  assert.equal(confirmEmailVerification(tokenHash("old"), 3_000_001), false);
  assert.equal(reserveEmailVerification(user, tokenHash("stale-user"), 3_060_000), false);
  const changed = findUserByEmail("new@example.com")!;
  assert.equal(reserveEmailVerification(changed, tokenHash("new"), 3_060_000), true);
  assert.equal(confirmEmailVerification(tokenHash("new"), 3_060_001), true);
  updateUserDetails(user.id, { name: user.name, email: "NEW@example.com", partnerName: "" });
  assert.ok(findUserByEmail("new@example.com")!.emailVerifiedAt);
  updateUserDetails(user.id, { name: user.name, email: "third@example.com", partnerName: "" });
  assert.equal(findUserByEmail("third@example.com")!.emailVerifiedAt, null);
});

test("approval does not confirm email and confirmation does not reverse rejection", () => {
  const user = newUser("review@example.com");
  updateUserStatus(user.id, "approved");
  assert.equal(findUserByEmail(user.email)!.emailVerifiedAt, null);
  reserveEmailVerification(user, tokenHash("review"), 4_000_000);
  updateUserStatus(user.id, "rejected");
  confirmEmailVerification(tokenHash("review"), 4_000_001);
  assert.equal(findUserByEmail(user.email)!.status, "rejected");
});

test("deleting accounts invalidates their links", () => {
  const user = newUser("deleted@example.com");
  reserveEmailVerification(user, tokenHash("deleted"), 5_000_000);
  deleteUser(user.id);
  assert.equal(confirmEmailVerification(tokenHash("deleted"), 5_000_001), false);
});
