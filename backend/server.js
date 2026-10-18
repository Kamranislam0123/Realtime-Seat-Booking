require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const pool = require("./db");
const { logger } = require("./utils/logger");
const jwt = require("jsonwebtoken");
const {
  seatHolds,
  HOLD_DURATION_MS,
  releaseExpiredHolds,
  startHoldExpiration,
} = require("./utils/seatHolds");
const authMiddleware = require("./middleware/authMiddleware");

const app = express();

const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  allowEIO3: true,
  connectTimeout: 45000,
});

// Make io available to controllers
app.set("io", io);

// Start seat hold expiration checker
startHoldExpiration(io);

// =========================
// Seat Hold Routes
// =========================

app.post("/api/bookings/hold", authMiddleware, async (req, res) => {
  try {
    const { seat_id } = req.body || {};
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!Number.isInteger(seat_id) || seat_id <= 0) {
      return res.status(400).json({ message: "Valid seat_id is required" });
    }

    // 1. Verify seat exists and is available in database
    const seatResult = await pool.query(
      "SELECT id, seat_number, status FROM seats WHERE id = $1",
      [seat_id]
    );

    if (seatResult.rows.length === 0) {
      return res.status(404).json({ message: "Seat not found" });
    }

    if (seatResult.rows[0].status !== "available") {
      return res.status(409).json({
        message: "Seat is already booked and cannot be held",
      });
    }

    // 2. Check if seat is actively held by another user (with lazy expiration check)
    const existingHold = seatHolds.get(String(seat_id));
    const now = Date.now();

    if (existingHold) {
      if (existingHold.expiresAt > now) {
        if (existingHold.userId !== user_id) {
          return res.status(409).json({
            message: "Seat is already held by another user",
            held_by: existingHold.userName,
          });
        }
      } else {
        // Lazily clean up expired hold
        seatHolds.delete(String(seat_id));
      }
    }

    const hold = {
      userId: user_id,
      userName: req.user?.name || "User",
      expiresAt: now + HOLD_DURATION_MS,
      socketId: null,
    };

    seatHolds.set(String(seat_id), hold);

    io.emit("seat-held", {
      seat_id: seat_id,
      user_id: user_id,
      held_by: hold.userName,
      expires_at: hold.expiresAt,
    });

    logger.info(`Seat ${seat_id} held by user ${user_id}`);

    return res.json({
      message: "Seat held successfully",
      seat_id,
      expires_in_ms: HOLD_DURATION_MS,
      expires_at: hold.expiresAt,
    });
  } catch (error) {
    logger.error("Seat hold error:", error);
    return res.status(500).json({ message: "Failed to hold seat" });
  }
});

app.delete("/api/bookings/hold/:seat_id", authMiddleware, (req, res) => {
  const seat_id = Number(req.params.seat_id);
  const user_id = req.user?.user_id;

  if (!user_id) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const hold = seatHolds.get(String(seat_id));

  if (!hold) {
    return res.status(404).json({ message: "No active hold on this seat" });
  }

  if (hold.userId !== user_id) {
    return res.status(403).json({ message: "You do not hold this seat" });
  }

  seatHolds.delete(String(seat_id));

  io.emit("seat-hold-released", {
    seat_id,
    released_by: user_id,
  });

  logger.info(`Seat ${seat_id} hold released by user ${user_id}`);

  return res.json({
    message: "Seat hold released",
    seat_id,
  });
});

app.get("/api/bookings/holds", (req, res) => {
  const now = Date.now();
  const activeHolds = [];

  for (const [seatId, hold] of seatHolds.entries()) {
    if (hold.expiresAt > now) {
      activeHolds.push({
        seat_id: Number(seatId),
        user_id: hold.userId,
        user_name: hold.userName,
        expires_at: hold.expiresAt,
        time_remaining_ms: hold.expiresAt - now,
      });
    } else {
      seatHolds.delete(seatId);
    }
  }

  return res.json({ holds: activeHolds });
});


// =========================
// Live User Presence
// =========================

// socketId -> { user_id, user_name, connected_at }
const userPresence = new Map();

// seat_id -> { socket_id, user_id, user_name, selected_at }
const seatSelections = new Map();

app.get("/api/presence", (req, res) => {
  const users = Array.from(userPresence.values()).map((p) => ({
    user_id: p.user_id,
    user_name: p.user_name,
    connected_at: p.connected_at,
  }));

  return res.json({ online_count: users.length, users });
});

function broadcastPresence() {
  io.emit("presence-updated", {
    online_count: userPresence.size,
    users: Array.from(userPresence.values()),
  });
}




// =========================
// Basic API
// =========================

app.get("/", (req, res) => {
  res.json({
    message: "Seat Booking API is running"
  });
});


// =========================
// Get all seats
// =========================

app.get("/api/seats", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM seats ORDER BY id"
    );

    res.json(result.rows);

  } catch (error) {
    logger.error("Database error", error);

    res.status(500).json({
      message: "Database error"
    });
  }
});


// =========================
// Admin Stats
// =========================

app.get("/api/admin/stats", async (req, res) => {
  try {
    const seatsResult = await pool.query(
      "SELECT status, COUNT(*) as count FROM seats GROUP BY status"
    );

    const seatStats = { available: 0, booked: 0 };
    for (const row of seatsResult.rows) {
      seatStats[row.status] = parseInt(row.count, 10);
    }

    const bookingsResult = await pool.query(
      "SELECT status, COUNT(*) as count FROM bookings GROUP BY status"
    );

    const bookingStats = { confirmed: 0, cancelled: 0 };
    for (const row of bookingsResult.rows) {
      bookingStats[row.status] = parseInt(row.count, 10);
    }

    const now = Date.now();
    const activeHolds = [];
    for (const [seatId, hold] of seatHolds.entries()) {
      if (hold.expiresAt > now) {
        activeHolds.push({
          seat_id: Number(seatId),
          user_name: hold.userName,
          time_remaining_ms: hold.expiresAt - now,
        });
      } else {
        seatHolds.delete(seatId);
      }
    }

    return res.json({
      seats: seatStats,
      bookings: bookingStats,
      online_count: userPresence.size,
      active_holds: activeHolds.length,
      holds: activeHolds,
      seat_selections: Array.from(seatSelections.entries()).map(
        ([seatId, sel]) => ({
          seat_id: Number(seatId),
          user_name: sel.user_name,
        })
      ),
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error("Admin stats error", error);
    res.status(500).json({ message: "Failed to load admin stats" });
  }
});


// =========================
// Booking Routes
// =========================

const bookingRoutes = require("./routes/bookingRoutes");
const authRoutes = require("./routes/authRoutes");

app.use("/api/bookings", bookingRoutes);
app.use("/api/auth", authRoutes);


// =========================
// Socket.IO Connection
// =========================

io.on("connection", (socket) => {

  const token = socket.auth?.token;
  let userInfo = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userInfo = {
        user_id: decoded.user_id,
        user_name: decoded.name || "User",
      };

      userPresence.set(socket.id, {
        user_id: decoded.user_id,
        user_name: decoded.name || "User",
        connected_at: Date.now(),
      });

      broadcastPresence();
    } catch (err) {
      // Invalid token - allow connection but without presence
    }
  }

  logger.info("User connected:", socket.id, userInfo ? `(${userInfo.user_name})` : "");

  socket.on("disconnect", () => {
    if (userPresence.has(socket.id)) {
      userPresence.delete(socket.id);
      broadcastPresence();
    }

    // Clean up seat selections for this user
    for (const [seatId, selection] of seatSelections.entries()) {
      if (selection.socket_id === socket.id) {
        seatSelections.delete(seatId);
      }
    }
    io.emit("seat-selection-changed", Object.fromEntries(seatSelections));

    logger.info("User disconnected:", socket.id);
  });

  // =========================
  // Seat Selection (Real-time "Someone is selecting")
  // =========================

  socket.on(
    "seat-selecting",
    (data) => {
      if (!userInfo) return;

      seatSelections.set(String(data.seat_id), {
        socket_id: socket.id,
        user_id: userInfo.user_id,
        user_name: userInfo.user_name,
        selected_at: Date.now(),
      });

      io.emit("seat-selection-changed", Object.fromEntries(seatSelections));
    }
  );

  socket.on(
    "seat-select-stop",
    (data) => {
      seatSelections.delete(String(data.seat_id));
      io.emit("seat-selection-changed", Object.fromEntries(seatSelections));
    }
  );

});


// =========================
// 404 Handler
// =========================

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`
  });
});

// =========================
// Centralized Error Handler
// =========================

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  logger.error("Unhandled error", err);

  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
});


// =========================
// Start Server
// =========================

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
