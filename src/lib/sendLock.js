// Atomically claims a deal for one send on a per-deal lock model (PostalSend,
// EmailSend). The filter only matches a free, not-recently-sent row; otherwise
// the upsert hits the unique dealId index (E11000), which is how a concurrent
// or repeated send is rejected. Returns null when claimed, else the blocking row.
export async function claimSendLock(Model, dealId, forceResend, { inFlightMs, resendBlockMs }) {
  const now = new Date();
  const sentCutoff = forceResend ? now : new Date(now.getTime() - resendBlockMs);
  try {
    await Model.findOneAndUpdate(
      {
        dealId,
        $and: [
          { $or: [{ inFlightUntil: null }, { inFlightUntil: { $lt: now } }] },
          { $or: [{ sentAt: null }, { sentAt: { $lt: sentCutoff } }] },
        ],
      },
      { $set: { inFlightUntil: new Date(now.getTime() + inFlightMs) } },
      { upsert: true },
    );
    return null;
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return (await Model.findOne({ dealId }).lean()) || {};
  }
}
