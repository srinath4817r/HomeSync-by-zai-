import { randomBytes } from "crypto";

/** Read a JSON body safely (never throws). */
export function readJson(req: Request): Promise<Record<string, unknown>> {
  return req
    .json()
    .catch(() => ({}))
    .then((b) => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {}));
}

/** Unambiguous invite alphabet (no 0/O/1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a human-friendly invite code like "HMK7-QX2P". */
export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}
