const pool = require("../db");
const { logger } = require("../utils/logger");
const { seatHolds } = require("../utils/seatHolds");

const bookSeat = async (req, res) => {
const { seat_id } = req.body || {};
const user_id = req.user.user_id;
if (
  !Number.isInteger(user_id) ||
  user_id <= 0 ||
  !Number.isInteger(seat_id) ||
  seat_id <= 0
) {
  return res.status(400).json({
    message: "Valid seat_id is required"
  });
}

// Check if seat is actively held by another user (with lazy expiration check)
const existingHold = seatHolds.get(String(seat_id));
if (existingHold) {
  if (existingHold.expiresAt > Date.now()) {
    if (existingHold.userId !== user_id) {
      return res.status(409).json({
        message: "Seat is currently held by another user. Please try again later.",
        held_by: existingHold.userName,
      });
    }
  } else {
    // Lazily clean up expired hold so it doesn't block booking
    seatHolds.delete(String(seat_id));
  }
}

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Atomically claim the seat
    const seatResult = await client.query(
      `UPDATE seats
       SET status = 'booked'
       WHERE id = $1 AND status = 'available'
       RETURNING id, seat_number`,
      [seat_id]
    );

    // Seat already booked or doesn't exist
    if (seatResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Seat already booked or does not exist"
      });
    }

    // Create booking record
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, seat_id, status)
       VALUES ($1, $2, 'confirmed')
       RETURNING *`,
      [user_id, seat_id]
    );

    // Commit database transaction
    await client.query("COMMIT");

    // Clear active hold on this seat
    seatHolds.delete(String(seat_id));

    // =====================================
    // REAL-TIME SOCKET.IO EVENT
    // =====================================

    const io = req.app.get("io");

    io.emit("seat-booked", {
      seat_id: seatResult.rows[0].id,
      seat_number: seatResult.rows[0].seat_number,
      status: "booked"
    });

    // Send response to booking user
    return res.status(201).json({
      message: "Booking successful",
      seat: seatResult.rows[0],
      booking: bookingResult.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    // Handle unique constraint violation on seat booking
    if (error.code === "23505") {
      return res.status(409).json({
        message: "This seat was already booked by another user."
      });
    }

    logger.error("Booking failed", error);

    return res.status(500).json({
      message: "Booking failed"
    });

  } finally {
    client.release();
  }
};


const getMyBookings = async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT
         b.id,
         b.user_id,
         b.seat_id,
         s.seat_number,
         b.status,
         b.booked_at
       FROM bookings b
       JOIN seats s ON b.seat_id = s.id
       WHERE b.user_id = $1
       ORDER BY b.booked_at DESC`,
      [user_id]
    );

    return res.json(result.rows);

  } catch (error) {
    logger.error("Failed to load bookings", error);

    return res.status(500).json({
      message: "Failed to load bookings"
    });
  }
};


const cancelBooking = async (req, res) => {
  const user_id = req.user.user_id;
  const { booking_id } = req.params;

  if (!Number.isInteger(Number(booking_id))) {
    return res.status(400).json({
      message: "Valid booking_id is required"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Find and lock user's active booking
    const bookingResult = await client.query(
      `SELECT id, seat_id, status
       FROM bookings
       WHERE id = $1
       AND user_id = $2
       AND status = 'confirmed'
       FOR UPDATE`,
      [booking_id, user_id]
    );

    if (bookingResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Active booking not found"
      });
    }

    const booking = bookingResult.rows[0];

    // Cancel booking
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE id = $1`,
      [booking.id]
    );

    // Make seat available again
    const seatResult = await client.query(
      `UPDATE seats
       SET status = 'available'
       WHERE id = $1
       RETURNING id, seat_number`,
      [booking.seat_id]
    );

    await client.query("COMMIT");

    // Real-time event
    const io = req.app.get("io");

    io.emit("seat-cancelled", {
      seat_id: seatResult.rows[0].id,
      seat_number: seatResult.rows[0].seat_number,
      status: "available"
    });

    return res.json({
      message: "Booking cancelled successfully",
      seat: seatResult.rows[0],
      booking_id: booking.id
    });

  } catch (error) {
    await client.query("ROLLBACK");

    logger.error("Cancellation failed", error);

    return res.status(500).json({
      message: "Cancellation failed"
    });

  } finally {
    client.release();
  }
};

module.exports = { bookSeat, getMyBookings , cancelBooking };