// =========================
// Seat Hold System (shared)
// =========================

const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// seatId (string) -> { userId, userName, expiresAt, socketId }
const seatHolds = new Map();

function releaseExpiredHolds(io) {
  const now = Date.now();

  for (const [seatId, hold] of seatHolds.entries()) {
    if (now > hold.expiresAt) {
      seatHolds.delete(seatId);
      io.emit("seat-hold-expired", {
        seat_id: Number(seatId),
        released_by: "timeout",
      });
    }
  }
}

function startHoldExpiration(io) {
  setInterval(() => releaseExpiredHolds(io), 10000);
}

module.exports = {
  seatHolds,
  HOLD_DURATION_MS,
  releaseExpiredHolds,
  startHoldExpiration,
};
