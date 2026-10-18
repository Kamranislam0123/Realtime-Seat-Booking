"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Navbar from "../components/Navbar";
import { logger } from "../utils/logger";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type BookingStatus = "confirmed" | "cancelled";

type Booking = {
  id: number;
  user_id: number;
  seat_id: number;
  seat_number: string;
  status: BookingStatus;
  booked_at: string;
};

type SeatCancelledEvent = {
  seat_id: number;
  seat_number: string;
  status: "available";
};

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // =====================================
  // LOAD MY BOOKINGS
  // =====================================

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      if (!API_URL) {
        throw new Error("API URL is not configured");
      }

      const response = await fetch(`${API_URL}/api/bookings/my`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to load bookings.");
        return;
      }

      setBookings(data);
    } catch (err) {
      logger.error("Booking loading error:", err);
      setError("Something went wrong while loading bookings.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // SOCKET.IO
  // =====================================

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (!API_URL) {
      return;
    }

    loadBookings();

    const socket = io(API_URL);

    socket.on("connect", () => {
      logger.info("Socket connected:", socket.id);
    });

    // =====================================
    // REAL-TIME CANCELLATION
    // =====================================

    socket.on(
      "seat-cancelled",
      (data: SeatCancelledEvent) => {
        logger.info("REAL-TIME CANCELLED EVENT:", data);

        setBookings((currentBookings) =>
          currentBookings.map((booking) =>
            booking.seat_id === data.seat_id &&
            booking.status === "confirmed"
              ? {
                  ...booking,
                  status: "cancelled",
                }
              : booking
          )
        );

        setMessage(
          `Seat ${data.seat_number} is now available.`
        );
      }
    );

    socket.on("disconnect", (reason: string) => {
      logger.info("Socket disconnected:", reason);
    });

    socket.on("connect_error", (err: Error) => {
      logger.error("Socket connection error:", err.message);
    });

    return () => {
      socket.off("seat-cancelled");
      socket.disconnect();
    };
  }, []);

  // =====================================
  // CANCEL BOOKING
  // =====================================

  const handleCancel = async (bookingId: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this booking?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setCancellingId(bookingId);
      setMessage("");
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      if (!API_URL) {
        throw new Error("API URL is not configured");
      }

      const response = await fetch(
        `${API_URL}/api/bookings/${bookingId}`,
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

      logger.info("Cancellation successful:", data);

      // Keep booking in history
      setBookings((currentBookings) =>
        currentBookings.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                status: "cancelled",
              }
            : booking
        )
      );

      setMessage(
        `Booking cancelled successfully. Seat ${data.seat.seat_number} is now available.`
      );
    } catch (err) {
      logger.error("Cancellation error:", err);
      setError("Something went wrong while cancelling.");
    } finally {
      setCancellingId(null);
    }
  };

  // =====================================
  // LOADING
  // =====================================

  if (loading) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-t-blue-500 border-slate-700 animate-spin mb-4" />

          <p className="text-lg text-slate-300">
            Loading your bookings...
          </p>
        </main>
      </>
    );
  }

  // =====================================
  // UI
  // =====================================

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-slate-950 text-white px-4 py-10">
        <div className="max-w-6xl mx-auto">

          {/* =========================
              HEADER
          ========================= */}

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-10">

            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                My Bookings
              </h1>

              <p className="text-slate-400">
                View and manage your seat bookings
              </p>
            </div>

            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-lg"
            >
              Book a Seat
            </button>

          </div>

          {/* =========================
              ERROR MESSAGE
          ========================= */}

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
              <p className="text-red-400 font-medium">
                {error}
              </p>
            </div>
          )}

          {/* =========================
              SUCCESS MESSAGE
          ========================= */}

          {message && (
            <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-center">
              <p className="text-green-400 font-medium">
                {message}
              </p>
            </div>
          )}

          {/* =========================
              EMPTY STATE
          ========================= */}

          {bookings.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">

              <div className="text-5xl mb-5">
                🎟️
              </div>

              <h2 className="text-2xl font-semibold mb-3">
                No Bookings Yet
              </h2>

              <p className="text-slate-400 mb-6">
                You don't have any seat bookings.
              </p>

              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold transition"
              >
                Book a Seat
              </button>

            </div>
          )}

          {/* =========================
              BOOKING CARDS
          ========================= */}

          {bookings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {bookings.map((booking) => {

                const isConfirmed =
                  booking.status === "confirmed";

                return (
                  <div
                    key={booking.id}
                    className={`
                      relative
                      overflow-hidden
                      rounded-2xl
                      border
                      p-6
                      shadow-xl
                      transition-all
                      duration-300
                      ${
                        isConfirmed
                          ? "bg-slate-900 border-slate-700 hover:border-green-500/50"
                          : "bg-slate-900/70 border-slate-800 opacity-80"
                      }
                    `}
                  >

                    {/* =====================
                        TOP SECTION
                    ===================== */}

                    <div className="flex items-start justify-between mb-7">

                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-[0.2em] mb-2">
                          Seat
                        </p>

                        <h2 className="text-4xl font-bold text-white">
                          {booking.seat_number}
                        </h2>
                      </div>

                      {/* STATUS */}

                      {isConfirmed ? (
                        <span className="px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/20 text-green-400 text-sm font-semibold">
                          Confirmed
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-400 text-sm font-semibold">
                          Cancelled
                        </span>
                      )}

                    </div>

                    {/* =====================
                        DIVIDER
                    ===================== */}

                    <div className="border-t border-slate-800 mb-5" />

                    {/* =====================
                        BOOKING ID
                    ===================== */}

                    <div className="flex items-center justify-between py-3 border-b border-slate-800/70">

                      <span className="text-slate-400">
                        Booking ID
                      </span>

                      <span className="font-semibold text-white">
                        #{booking.id}
                      </span>

                    </div>

                    {/* =====================
                        BOOKED AT
                    ===================== */}

                    <div className="py-3 border-b border-slate-800/70">

                      <p className="text-slate-400 text-sm mb-1">
                        Booked at
                      </p>

                      <p className="text-white font-medium">
                        {new Date(
                          booking.booked_at
                        ).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>

                      <p className="text-slate-400 text-sm mt-1">
                        {new Date(
                          booking.booked_at
                        ).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>

                    </div>

                    {/* =====================
                        ACTION
                    ===================== */}

                    {isConfirmed ? (
                      <button
                        onClick={() =>
                          handleCancel(booking.id)
                        }
                        disabled={
                          cancellingId === booking.id
                        }
                        className={`
                          mt-6
                          w-full
                          py-3.5
                          rounded-xl
                          font-semibold
                          transition-all
                          ${
                            cancellingId === booking.id
                              ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                              : "bg-red-600 hover:bg-red-500 text-white hover:shadow-lg hover:shadow-red-600/20"
                          }
                        `}
                      >
                        {cancellingId === booking.id
                          ? "Cancelling..."
                          : "Cancel Booking"}
                      </button>
                    ) : (
                      <div className="mt-6 w-full py-3.5 rounded-xl bg-slate-800/70 border border-slate-700 text-center text-slate-500 font-medium">
                        Booking Cancelled
                      </div>
                    )}

                  </div>
                );
              })}

            </div>
          )}

        </div>
      </main>
    </>
  );
}