const express = require("express");

const {
  bookSeat,
  getMyBookings,
  cancelBooking
} = require("../controllers/bookingController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, bookSeat);

router.get("/my", authMiddleware, getMyBookings);

router.delete("/:booking_id", authMiddleware, cancelBooking);

module.exports = router;