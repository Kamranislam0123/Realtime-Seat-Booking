"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import Navbar from "./components/Navbar";
import { logger } from "./utils/logger";

type SeatStatus = "available" | "booked" | "held";

type Seat = {
  id: number;
  seat_number: string;
  status: SeatStatus;
};

type SeatBookedEvent = {
  seat_id: number;
  seat_number: string;
  status: "booked";
};

type SeatCancelledEvent = {
  seat_id: number;
  seat_number: string;
  status: "available";
};

type BookingResponse = {
  message: string;
  seat: {
    id: number;
    seat_number: string;
  };
  booking: {
    id: number;
    user_id: number;
    seat_id: number;
    status: string;
    booked_at: string;
  };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [socketConnected, setSocketConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);

  const [confirmation, setConfirmation] =
    useState<BookingResponse | null>(null);

type SeatHoldInfo = {
  user_id?: number;
  user_name: string;
  expires_at: number;
  time_remaining: number;
};

  const [seatHolds, setSeatHolds] = useState<Map<number, SeatHoldInfo>>(new Map());

  const [seatSelections, setSeatSelections] = useState<
    Map<number, { user_name: string }>
  >(new Map());

  const [holding, setHolding] = useState(false);
  const [releasingHold, setReleasingHold] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  // =========================
  // Load Holds
  // =========================

  const loadHolds = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/bookings/holds`);

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      const holds = new Map<number, SeatHoldInfo>();

      for (const hold of data.holds) {
        holds.set(hold.seat_id, {
          user_id: hold.user_id,
          user_name: hold.user_name,
          expires_at: hold.expires_at,
          time_remaining: hold.time_remaining_ms,
        });
      }

      setSeatHolds(holds);
    } catch (err) {
      logger.error("Hold loading error:", err);
    }
  }, []);

  // =========================
  // Load Seats
  // =========================

  const loadSeats = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (!API_URL) {
        throw new Error("API URL is not configured");
      }

      const response = await fetch(`${API_URL}/api/seats`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load seats");
      }

      const data: Seat[] = await response.json();

      setSeats(data);

      // Fetch active holds
      await loadHolds();
    } catch (error) {
      logger.error("Seat loading error:", error);

      setError(
        "Unable to load seats. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [loadHolds]);

  // =========================
  // Hold Seat
  // =========================

  const holdSeat = async (seat: Seat) => {
    if (holding) return;

    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      setHolding(true);

      // If user had another seat selected with an active hold, release it first
      if (selectedSeat && selectedSeat.id !== seat.id && seatHolds.has(selectedSeat.id)) {
        try {
          await fetch(`${API_URL}/api/bookings/hold/${selectedSeat.id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (releaseErr) {
          logger.error("Auto release previous hold error:", releaseErr);
        }
      }

      const response = await fetch(`${API_URL}/api/bookings/hold`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          seat_id: seat.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        setError(data.message || "Failed to hold seat.");
        return;
      }

      setMessage(`Seat ${seat.seat_number} is held for 5 minutes.`);
      setSelectedSeat(seat);
    } catch (err) {
      logger.error("Hold seat error:", err);
      setError("Unable to hold seat. Please check your connection.");
    } finally {
      setHolding(false);
    }
  };

  // =========================
  // Release Hold
  // =========================

  const releaseHold = async (seatId: number) => {
    if (releasingHold) return;

    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      setReleasingHold(true);

      const response = await fetch(
        `${API_URL}/api/bookings/hold/${seatId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        setError(data.message || "Failed to release hold.");
        return;
      }

      setMessage("Seat hold released.");
      setSelectedSeat(null);
    } catch (err) {
      logger.error("Release hold error:", err);
      setError("Unable to release hold. Please check your connection.");
    } finally {
      setReleasingHold(false);
    }
  };


  // =========================
  // Authentication + Socket
  // =========================

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    loadSeats();

    if (!API_URL) {
      logger.error("NEXT_PUBLIC_API_URL is missing");
      return;
    }

    const socket: Socket = io(API_URL, {
      auth: {
        token: localStorage.getItem("token"),
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      logger.info("Socket connected:", socket.id);
      setSocketConnected(true);
      // Re-fetch ground truth seat map and holds on connection & every reconnection
      loadSeats();
    });

    // =========================
    // Real-time Booking
    // =========================

    socket.on("seat-booked", (data: SeatBookedEvent) => {
      logger.info("REAL-TIME BOOKED EVENT:", data);

      setSeats((currentSeats) =>
        currentSeats.map((seat) =>
          seat.id === data.seat_id
            ? {
                ...seat,
                status: "booked",
              }
            : seat
        )
      );

      // Remove hold from seatHolds
      setSeatHolds((currentHolds) => {
        const next = new Map(currentHolds);
        next.delete(data.seat_id);
        return next;
      });

      // Remove selection if another user booked it
      setSelectedSeat((currentSelectedSeat) => {
        if (currentSelectedSeat?.id === data.seat_id) {
          setMessage(
            `Seat ${data.seat_number} was just booked by another user.`
          );

          return null;
        }

        return currentSelectedSeat;
      });
    });

    // =========================
    // Real-time Cancellation
    // =========================

    socket.on("seat-cancelled", (data: SeatCancelledEvent) => {
      logger.info("REAL-TIME CANCELLED EVENT:", data);

      setSeats((currentSeats) =>
        currentSeats.map((seat) =>
          seat.id === data.seat_id
            ? {
                ...seat,
                status: "available",
              }
            : seat
        )
      );
    });

    // =========================
    // Real-time Seat Hold
    // =========================

    socket.on(
      "seat-held",
      (data: { seat_id: number; user_id?: number; held_by: string; expires_at: number }) => {
        logger.info("REAL-TIME SEAT HELD:", data);

        setSeats((currentSeats) =>
          currentSeats.map((seat) =>
            seat.id === data.seat_id
              ? { ...seat, status: "held" }
              : seat
          )
        );

        setSeatHolds((currentHolds) => {
          const next = new Map(currentHolds);
          next.set(data.seat_id, {
            user_id: data.user_id,
            user_name: data.held_by,
            expires_at: data.expires_at,
            time_remaining: data.expires_at - Date.now(),
          });
          return next;
        });
      }
    );

    socket.on(
      "seat-hold-released",
      (data: { seat_id: number; released_by: number }) => {
        logger.info("REAL-TIME SEAT HOLD RELEASED:", data);

        setSeats((currentSeats) =>
          currentSeats.map((seat) =>
            seat.id === data.seat_id
              ? { ...seat, status: "available" }
              : seat
          )
        );

        setSeatHolds((currentHolds) => {
          const next = new Map(currentHolds);
          next.delete(data.seat_id);
          return next;
        });

        if (selectedSeat?.id === data.seat_id) {
          setSelectedSeat(null);
        }
      }
    );

    socket.on(
      "seat-hold-expired",
      (data: { seat_id: number; released_by: string }) => {
        logger.info("REAL-TIME SEAT HOLD EXPIRED:", data);

        setSeats((currentSeats) =>
          currentSeats.map((seat) =>
            seat.id === data.seat_id
              ? { ...seat, status: "available" }
              : seat
          )
        );

        setSeatHolds((currentHolds) => {
          const next = new Map(currentHolds);
          next.delete(data.seat_id);
          return next;
        });

        if (selectedSeat?.id === data.seat_id) {
          setSelectedSeat(null);
          setMessage("Your seat hold expired.");
        }
      }
    );

    // =========================
    // Socket Error
    // =========================

    socket.on("connect_error", (error) => {
      logger.error("Socket connection error:", error);
      setSocketConnected(false);
    });

    socket.on(
      "presence-updated",
      (data: { online_count: number; users: Array<{ user_id: number; user_name: string; connected_at: number }> }) => {
        logger.info("REAL-TIME PRESENCE UPDATED:", data);
        setOnlineCount(data.online_count);
      }
    );

    socket.on(
      "seat-selection-changed",
      (data: Record<string, { socket_id: string; user_id: number; user_name: string; selected_at: number }>) => {
        logger.info("REAL-TIME SEAT SELECTION CHANGED:", data);

        const selections = new Map<number, { user_name: string }>();
        for (const [seatId, selection] of Object.entries(data)) {
          selections.set(Number(seatId), {
            user_name: selection.user_name,
          });
        }
        setSeatSelections(selections);
      }
    );

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected:", reason);
      setSocketConnected(false);
    });

    return () => {
      socket.off("connect");
      socket.off("seat-booked");
      socket.off("seat-cancelled");
      socket.off("seat-held");
      socket.off("seat-hold-released");
      socket.off("seat-hold-expired");
      socket.off("presence-updated");
      socket.off("seat-selection-changed");
      socket.off("connect_error");
      socket.off("disconnect");

      socket.disconnect();
    };
  }, [loadSeats]);

  // =========================
  // Hold Countdown Timer
  // =========================

  useEffect(() => {
    const interval = setInterval(() => {
      setSeatHolds((currentHolds) => {
        const next = new Map(currentHolds);
        let changed = false;
        const expiredSeatIds: number[] = [];

        for (const [seatId, hold] of next.entries()) {
          const remaining = hold.time_remaining - 1000;
          if (remaining <= 0) {
            next.delete(seatId);
            expiredSeatIds.push(seatId);
            changed = true;
          } else {
            next.set(seatId, { ...hold, time_remaining: remaining });
            changed = true;
          }
        }

        if (expiredSeatIds.length > 0) {
          setSeats((currentSeats) =>
            currentSeats.map((seat) =>
              expiredSeatIds.includes(seat.id) && seat.status === "held"
                ? { ...seat, status: "available" }
                : seat
            )
          );
          setSelectedSeat((current) =>
            current && expiredSeatIds.includes(current.id) ? null : current
          );
        }

        return changed ? next : currentHolds;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);


  // =========================
  // Select Seat
  // =========================

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === "booked") {
      return;
    }

    const hold = seatHolds.get(seat.id);
    let currentUserId: number | null = null;
    try {
      const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (userStr) {
        currentUserId = JSON.parse(userStr)?.id ?? null;
      }
    } catch {}

    const isMyHold = hold && (selectedSeat?.id === seat.id || (currentUserId !== null && hold.user_id === currentUserId));

    setMessage("");
    setError("");
    setConfirmation(null);

    if (seat.status === "held" && hold && !isMyHold) {
      setError(`Seat ${seat.seat_number} is held by ${hold.user_name}.`);
      return;
    }

    if (seat.status === "held" && isMyHold) {
      // User clicked their own held seat -> select it for booking
      setSelectedSeat(seat);
      return;
    }

    // Available seat -> hold it
    holdSeat(seat);
  };

  // =========================
  // Booking
  // =========================

  const handleBooking = async () => {
    if (!selectedSeat) {
      setError("Please select a seat first.");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (!API_URL) {
      setError("API URL is not configured.");
      return;
    }

    try {
      setBooking(true);
      setMessage("");
      setError("");
      setConfirmation(null);

      const response = await fetch(`${API_URL}/api/bookings`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          seat_id: selectedSeat.id,
        }),
      });

      let data: unknown = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      // =========================
      // Unauthorized
      // =========================

      if (response.status === 401) {
        localStorage.removeItem("token");

        window.location.href = "/login";
        return;
      }

      // =========================
      // Seat Already Booked
      // =========================

      if (response.status === 409) {
        setError(
          (data as { message?: string }).message ||
            "This seat was already booked by another user."
        );

        setSelectedSeat(null);

        await loadSeats();

        return;
      }

      // =========================
      // Other Error
      // =========================

      if (!response.ok) {
        setError(
          (data as { message?: string }).message ||
            "Booking failed. Please try again."
        );
        return;
      }

      // =========================
      // Success
      // =========================

      const bookingData = data as BookingResponse;

      logger.info("Booking successful:", bookingData);
logger.info("CONFIRMATION DATA:", bookingData);
      setMessage("Booking successful!");

      setConfirmation(bookingData);

      setSelectedSeat(null);

      // Clean up hold for booked seat immediately
      setSeatHolds((currentHolds) => {
        const next = new Map(currentHolds);
        next.delete(bookingData.seat.id);
        return next;
      });

      // Update current browser immediately
      setSeats((currentSeats) =>
        currentSeats.map((seat) =>
          seat.id === bookingData.seat.id
            ? {
                ...seat,
                status: "booked",
              }
            : seat
        )
      );
    } catch (error) {
      logger.error("Booking error:", error);

      setError(
        "Unable to complete booking. Please check your connection."
      );
    } finally {
      setBooking(false);
    }
  };

  // =========================
  // Cancel Booking
  // =========================

  const handleCancelBooking = async () => {
    if (!confirmation) {
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      setCancelling(true);

      const response = await fetch(
        `${API_URL}/api/bookings/${confirmation.booking.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Cancellation failed.");
        return;
      }

      setMessage(`Booking cancelled. Seat ${confirmation.seat.seat_number} is now available.`);

      setConfirmation(null);
      setSelectedSeat(null);

      await loadSeats();
    } catch (error) {
      logger.error("Cancellation error:", error);
      setError("Unable to cancel booking. Please check your connection.");
    } finally {
      setCancelling(false);
    }
  };

  // =========================
  // Loading Screen
  // =========================

  if (loading) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-t-blue-500 border-slate-700 animate-spin mb-4" />

          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-lg font-medium text-white">
              Loading seats...
            </p>
            <p className="text-sm text-slate-400">
              Please wait while we fetch seat availability
            </p>
          </div>
        </main>
      </>
    );
  }

  // =========================
  // Main UI
  // =========================

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-slate-950 text-white px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">

          {/* =========================
              Header
          ========================= */}

          <div className="text-center mb-8 md:mb-10">

            <div className="flex justify-center items-center gap-2 mb-4">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  socketConnected
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              />

              <span className="text-sm text-slate-400">
                {socketConnected
                  ? "Real-time connected"
                  : "Real-time disconnected"}
              </span>

              <span className="text-sm text-slate-400 ml-4">
                👥 {onlineCount} online
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold mb-3">
              Smart Seat Booking
            </h1>

            <p className="text-slate-400 text-base md:text-lg">
              Select your preferred seat
            </p>
          </div>

          {/* =========================
              Error
          ========================= */}

          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-5 text-center shadow-sm">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-red-500/20 mb-3">
                <span className="text-red-400">⚠</span>
              </div>

              <p className="text-red-400 font-semibold">
                {error.includes("already booked")
                  ? "This seat is no longer available."
                  : error}
              </p>

              <button
                onClick={loadSeats}
                className="mt-4 text-sm text-red-300 underline hover:text-white"
              >
                Refresh seats
              </button>
            </div>
          )}

          {/* =========================
              Success Message
          ========================= */}

          {message && !confirmation && (
            <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-center">
              <p className="text-green-400 font-medium">
                {message}
              </p>
            </div>
          )}

          {/* =========================
              Booking Confirmation
          ========================= */}

          {confirmation && (
            <div className="mb-8 rounded-2xl border border-green-500/30 bg-green-500/10 p-6">

              <div className="text-center">

                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <span className="text-2xl text-green-400">
                    ✓
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-green-400">
                  Booking Confirmed
                </h2>

                <p className="mt-2 text-slate-300">
                  Your seat has been successfully booked.
                </p>

              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">

                <div className="rounded-xl bg-slate-900/70 p-4 text-center">
                  <p className="text-sm text-slate-500">
                    Seat
                  </p>

                  <p className="mt-1 text-xl font-bold text-white">
                    {confirmation.seat.seat_number}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-900/70 p-4 text-center">
                  <p className="text-sm text-slate-500">
                    Booking ID
                  </p>

                  <p className="mt-1 text-xl font-bold text-white">
                    #{confirmation.booking.id}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-900/70 p-4 text-center">
                  <p className="text-sm text-slate-500">
                    Status
                  </p>

                  <p className="mt-1 text-xl font-bold text-green-400">
                    Confirmed
                  </p>
                </div>

              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                    cancelling
                      ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-red-600 text-white hover:bg-red-500 hover:shadow-red-500/20"
                  }`}
                >
                  {cancelling ? "Cancelling..." : "Cancel Booking"}
                </button>
              </div>

            </div>
          )}

          {/* =========================
              Screen
          ========================= */}

          <div className="mb-10 md:mb-14">

            <div className="mx-auto max-w-4xl">

              <div className="rounded-xl bg-slate-300 py-3 md:py-4 text-center text-sm md:text-base font-semibold text-black shadow-lg">
                SCREEN
              </div>

              <div className="mx-auto mt-2 h-1 w-3/4 rounded-full bg-slate-700" />

            </div>

          </div>

          {/* =========================
              Seat Grid
          ========================= */}

          <div className="mx-auto max-w-4xl">

            <div className="grid grid-cols-5 gap-2 sm:gap-3 md:gap-4">

              {seats.map((seat) => {

                const hold = seatHolds.get(seat.id);
                const selection = seatSelections.get(seat.id);
                const isBooked =
                  seat.status === "booked";

                const isHeld =
                  seat.status === "held" || !!hold;

                let currentUserId: number | null = null;
                try {
                  const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
                  if (userStr) {
                    currentUserId = JSON.parse(userStr)?.id ?? null;
                  }
                } catch {}

                const isMyHold =
                  isHeld && (selectedSeat?.id === seat.id || (currentUserId !== null && hold?.user_id === currentUserId));

                const isBeingSelectedByOther =
                  !!selection && selectedSeat?.id !== seat.id;

                const isSelected =
                  selectedSeat?.id === seat.id && !isHeld;

                const timeRemaining = hold
                  ? Math.max(0, Math.ceil(hold.time_remaining / 1000))
                  : 0;

                const minutes = Math.floor(timeRemaining / 60);
                const seconds = timeRemaining % 60;
                const timerText =
                  hold && timeRemaining > 0
                    ? `${minutes}:${seconds.toString().padStart(2, "0")}`
                    : "";

                return (
                  <button
                    key={seat.id}
                    onClick={() => handleSeatClick(seat)}
                    onMouseEnter={() => {
                      socketRef.current?.emit("seat-selecting", {
                        seat_id: seat.id,
                      });
                    }}
                    onMouseLeave={() => {
                      socketRef.current?.emit("seat-select-stop", {
                        seat_id: seat.id,
                      });
                    }}
                    disabled={isBooked || booking || holding}
                    aria-label={`Seat ${seat.seat_number} ${
                      isBooked
                        ? "booked"
                        : isHeld
                        ? "held"
                        : isBeingSelectedByOther
                        ? "being selected"
                        : isSelected
                        ? "selected"
                        : "available"
                    }`}
                    className={`
                      relative
                      h-14
                      sm:h-16
                      md:h-20
                      rounded-lg
                      md:rounded-xl
                      font-semibold
                      text-sm
                      sm:text-base
                      md:text-lg
                      shadow-md
                      transition-all
                      duration-200

                      ${
                        isBooked
                          ? "bg-red-500 text-white cursor-not-allowed"

                          : isHeld
                          ? isMyHold
                            ? "bg-yellow-400 text-black scale-[1.03] ring-4 ring-yellow-200/40"
                            : "bg-orange-500/30 text-white cursor-not-allowed opacity-80"

                          : isBeingSelectedByOther
                            ? "bg-green-500 text-white ring-4 ring-blue-500/30 animate-pulse cursor-pointer"
                            : isSelected
                            ? "bg-yellow-400 text-black scale-[1.03] ring-4 ring-yellow-200/40"

                            : "bg-green-500 text-black hover:bg-green-400 hover:scale-[1.03] cursor-pointer"
                      }
                    `}
                  >
                    {seat.seat_number}

                    {isBooked && (
                      <span className="absolute bottom-1 right-2 text-[9px] uppercase opacity-70">
                        Booked
                      </span>
                    )}

                    {isHeld && !isMyHold && (
                      <span className="absolute bottom-1 right-2 text-[9px] uppercase opacity-90 font-bold">
                        Held
                      </span>
                    )}

                    {isBeingSelectedByOther && selection && (
                      <span className="absolute bottom-1 right-2 text-[9px] uppercase opacity-90 font-bold text-blue-300">
                        Selecting
                      </span>
                    )}

                    {isHeld && hold && timeRemaining > 0 && (
                      <div className="absolute top-1 left-1/2 -translate-x-1/2">
                        <span
                          className={`text-[10px] font-bold ${
                            timeRemaining <= 10
                              ? "text-red-400 animate-pulse"
                              : "text-white"
                          }`}
                        >
                          {timerText}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}

            </div>

          </div>

          {/* =========================
              Legend
          ========================= */}

          <div className="mt-8 md:mt-10 flex flex-wrap justify-center gap-5 md:gap-8 text-sm md:text-base">

            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-green-500" />
              <span>Available</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-red-500" />
              <span>Booked</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-yellow-400" />
              <span>Selected</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-orange-500/30" />
              <span>Held by Another</span>
            </div>

          </div>

          {/* =========================
              Selected Seat
          ========================= */}

          <div className="mt-8 min-h-8 text-center">

            {selectedSeat ? (
              <>
                <p className="text-lg font-semibold text-yellow-400">
                  Selected Seat: {selectedSeat.seat_number}
                </p>

                {seatHolds.get(selectedSeat.id) && (
                  <div className="mt-3">
                    <button
                      onClick={() => releaseHold(selectedSeat.id)}
                      disabled={releasingHold}
                      className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold transition"
                    >
                      {releasingHold ? "Releasing..." : "Release Hold"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Select an available seat to continue
              </p>
            )}

          </div>

          {/* =========================
              Confirm Booking
          ========================= */}

          <div className="mx-auto mt-5 max-w-4xl">

            <button
              onClick={handleBooking}
              disabled={!selectedSeat || booking}
              className={`
                w-full
                rounded-xl
                py-4
                text-base
                md:text-lg
                font-semibold
                transition-all

                ${
                  !selectedSeat || booking
                    ? "cursor-not-allowed bg-slate-800 text-slate-500"
                    : "bg-blue-600 text-white shadow-lg hover:bg-blue-500 hover:shadow-blue-500/20"
                }
              `}
            >
              {booking ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-white" />
                  Booking...
                </span>
              ) : (
                "Confirm Booking"
              )}
            </button>

          </div>

          {/* =========================
              Footer Info
          ========================= */}

          <div className="mt-8 text-center text-xs text-slate-600">
            Seat availability updates automatically in real-time.
          </div>

        </div>
      </main>
    </>
  );
}