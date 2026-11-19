import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

mkdirSync(resolve(".tmp-validation"), { recursive: true });
process.env.DATABASE_PATH = join(
  mkdtempSync(resolve(".tmp-validation/password-reset-")),
  "users.sqlite",
);
const {
  createPendingUser,
  findUserByEmail,
  reservePasswordReset,
  completePasswordReset,
  expirePasswordReset,
  updateUserDetails,
  updateUserStatus,
  deleteUser,
} = await import("./database.server.ts");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
function user(email: string) {
  createPendingUser({ name: "Recovery QA", email, partnerName: "", passwordHash: "old-hash" });
  return findUserByEmail(email)!;
}

test("changes only the password and session version, consumes link, preserves verification and approval", () => {
  const account = user("single@example.com");
  assert.equal(account.passwordVersion, 0);
  assert.equal(reservePasswordReset(account, hash("one"), 1_000_000), true);
  assert.equal(completePasswordReset(hash("one"), "new-hash", 1_000_001), true);
  assert.equal(completePasswordReset(hash("one"), "replay", 1_000_002), false);
  const changed = findUserByEmail(account.email)!;
  assert.equal(changed.passwordHash, "new-hash");
  assert.equal(changed.passwordVersion, 1);
  assert.equal(changed.emailVerifiedAt, null);
  assert.equal(changed.status, "pending");
});

test("stores only a digest, enforces exact expiry and supersedes old links", () => {
  const account = user("expiry@example.com");
  reservePasswordReset(account, hash("first"), 2_000_000);
  assert.equal(reservePasswordReset(account, hash("second"), 2_059_999), false);
  assert.equal(reservePasswordReset(account, hash("second"), 2_060_000), true);
  assert.equal(completePasswordReset(hash("first"), "bad", 2_060_001), false);
  assert.equal(completePasswordReset("second", "bad", 2_060_001), false);
  assert.equal(completePasswordReset(hash("second"), "bad", 3_860_000), false);
  const db = new DatabaseSync(process.env.DATABASE_PATH!);
  assert.equal(
    db.prepare("SELECT token_hash FROM password_resets WHERE user_id = ?").get(account.id)
      ?.token_hash,
    hash("second"),
  );
  db.close();
  assert.equal(findUserByEmail(account.email)!.passwordHash, "old-hash");
});

test("retains cooldown and hourly quotas after successful reset or delivery failure", () => {
  const account = user("limits@example.com");
  for (let i = 0; i < 5; i++) {
    const now = 4_000_000 + i * 60_000;
    assert.equal(reservePasswordReset(account, hash(`limit${i}`), now), true);
    if (i % 2) expirePasswordReset(hash(`limit${i}`));
    else assert.equal(completePasswordReset(hash(`limit${i}`), `password${i}`, now + 1), true);
    assert.equal(reservePasswordReset(account, hash("early"), now + 2), false);
  }
  assert.equal(reservePasswordReset(account, hash("sixth"), 4_300_000), false);
  assert.equal(reservePasswordReset(account, hash("new-hour"), 7_600_000), true);
});

test("email changes, rejection and deletion invalidate reset authorization", () => {
  const account = user("changed@example.com");
  reservePasswordReset(account, hash("email"), 10_000_000);
  updateUserDetails(account.id, { name: account.name, partnerName: "", email: "new@example.com" });
  assert.equal(completePasswordReset(hash("email"), "bad", 10_000_001), false);
  updateUserDetails(account.id, { name: account.name, partnerName: "", email: account.email });
  assert.equal(completePasswordReset(hash("email"), "bad", 10_000_002), false);
  updateUserDetails(account.id, { name: account.name, partnerName: "", email: "new@example.com" });
  assert.equal(reservePasswordReset(account, hash("stale"), 10_060_000), false);
  const changed = findUserByEmail("new@example.com")!;
  reservePasswordReset(changed, hash("rejected"), 10_060_000);
  updateUserStatus(changed.id, "rejected");
  assert.equal(completePasswordReset(hash("rejected"), "bad", 10_060_001), false);
  assert.equal(reservePasswordReset(changed, hash("reject-send"), 10_120_000), false);
  deleteUser(changed.id);
  assert.equal(completePasswordReset(hash("rejected"), "bad", 10_060_002), false);
});
