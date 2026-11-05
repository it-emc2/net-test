// Atomic per-deal send lock — port of legacy src/lib/sendLock.js (EmailSend, later PostalSend).
// The filter only matches a free, not-recently-sent row; otherwise the upsert hits the unique
// dealId index (E11000) → the send is rejected. Returns null when claimed, else the blocking row.
import type { Model } from "mongoose";

export async function claimSendLock(M: Model<any>, dealId: string, forceResend: boolean, o: { inFlightMs: number; resendBlockMs: number }) {
  const now = new Date();
  const sentCutoff = forceResend ? now : new Date(now.getTime() - o.resendBlockMs);
  try {
    await M.findOneAndUpdate(
      {
        dealId,
        $and: [
          { $or: [{ inFlightUntil: null }, { inFlightUntil: { $lt: now } }] },
          { $or: [{ sentAt: null }, { sentAt: { $lt: sentCutoff } }] },
        ],
      },
      { $set: { inFlightUntil: new Date(now.getTime() + o.inFlightMs) } },
      { upsert: true },
    );
    return null;
  } catch (err) {
    if ((err as { code?: number })?.code !== 11000) throw err;
    return ((await M.findOne({ dealId }).lean()) as Record<string, any> | null) || {};
  }
}

export const EMAIL_RESEND_BLOCK_MS = 24 * 60 * 60 * 1000;
export const EMAIL_IN_FLIGHT_MS = 5 * 60 * 1000;
