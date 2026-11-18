import { createHash, randomBytes } from "node:crypto";
import {
  confirmEmailVerification,
  expireEmailVerification,
  reserveEmailVerification,
  type StoredUser,
} from "@/lib/database.server";
import { emailConfiguration, sendVerificationEmail } from "@/lib/email.server";

export async function requestEmailVerification(user: StoredUser) {
  if (user.emailVerifiedAt) return "verified" as const;
  emailConfiguration();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (!reserveEmailVerification(user, tokenHash, Date.now())) return "limited" as const;
  try {
    await sendVerificationEmail(user.email, token);
    return "sent" as const;
  } catch (error) {
    expireEmailVerification(tokenHash);
    throw error;
  }
}

export function verifyEmailToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return confirmEmailVerification(tokenHash, Date.now());
}
