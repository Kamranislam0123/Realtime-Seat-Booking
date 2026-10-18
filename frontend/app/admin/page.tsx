"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { logger } from "../utils/logger";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type SeatStats = {
  available: number;
  booked: number;
};

type BookingStats = {
  confirmed: number;
  cancelled: number;
};

type Hold = {
  seat_id: number;
  user_name: string;
  time_remaining_ms: number;
};

type Selection = {
  seat_id: number;
  user_name: string;
};

type AdminStats = {
  seats: SeatStats;
  bookings: BookingStats;
  online_count: number;
  active_holds: number;
  holds: Hold[];
  seat_selections: Selection[];
  timestamp: number;
};

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const loadStats = useCallback(async (initial = false) => {
    try {
      if (initial) {
        setLoading(true);
      }

      if (!API_URL) {
        throw new Error("API URL is not configured");
      }

      const response = await fetch(`${API_URL}/api/admin/stats`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load admin stats");
      }

      const data: AdminStats = await response.json();
      setStats(data);
    } catch (err) {
      logger.error("Admin stats loading error:", err);
    } finally {
      if (initial) {
        setLoading(false);
      }
    }
  }, []);

  const refreshStats = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
    }

    refreshTimer.current = setTimeout(() => {
      loadStats(false);
    }, 500);
  }, []);

  // =========================
  // Socket.IO
  // =========================

  useEffect(() => {
    if (!API_URL) return;

    const socket: Socket = io(API_URL, {
      auth: {
        token: localStorage.getItem("token"),
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      logger.info("Admin socket connected:", socket.id);
      setSocketConnected(true);
      loadStats(true);
    });

    // Refresh stats on any real-time change (debounced)
    socket.on("seat-booked", refreshStats);
    socket.on("seat-cancelled", refreshStats);
    socket.on("seat-held", refreshStats);
    socket.on("seat-hold-released", refreshStats);
    socket.on("seat-hold-expired", refreshStats);
    socket.on("presence-updated", refreshStats);
    socket.on("seat-selection-changed", refreshStats);

    socket.on("disconnect", () => {
      logger.info("Admin socket disconnected");
      setSocketConnected(false);
    });

    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }

      socket.disconnect();
    };
  }, [API_URL, loadStats, refreshStats]);

  // =========================
  // Helpers
  // =========================

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // =========================
  // Render
  // =========================

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-t-blue-500 border-slate-700 animate-spin mb-4" />
        <p className="text-lg text-slate-300">Loading admin dashboard...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
        <p className="text-red-400">
          Failed to load admin dashboard. Please check your connection.
        </p>
      </div>
    );
  }

  const totalSeats = stats.seats.available + stats.seats.booked;
  const occupancyRate =
    totalSeats > 0
      ? Math.round((stats.seats.booked / totalSeats) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* =========================
            Header
        ========================= */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Admin Dashboard
            </h1>
            <p className="text-slate-400">
              Real-time seat booking system overview
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                socketConnected ? "bg-green-500" : "bg-red-500"
              } animate-pulse`}
            />
            <span className="text-sm text-slate-400">
              {socketConnected ? "Live" : "Disconnected"}
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs">
              👥 {stats.online_count} online
            </span>
          </div>
        </div>

        {/* =========================
            Stat Cards
        ========================= */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Total Seats
            </p>
            <p className="text-3xl font-bold text-white">{totalSeats}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Available
            </p>
            <p className="text-3xl font-bold text-green-400">
              {stats.seats.available}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Booked
            </p>
            <p className="text-3xl font-bold text-red-400">
              {stats.seats.booked}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Occupancy
            </p>
            <p className="text-3xl font-bold text-blue-400">
              {occupancyRate}%
            </p>
          </div>
        </div>

        {/* =========================
            Secondary Stats
        ========================= */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Active Holds
            </p>
            <p className="text-3xl font-bold text-yellow-400">
              {stats.active_holds}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Confirmed Bookings
            </p>
            <p className="text-3xl font-bold text-green-400">
              {stats.bookings.confirmed}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Cancelled
            </p>
            <p className="text-3xl font-bold text-slate-500">
              {stats.bookings.cancelled}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm uppercase tracking-wide mb-2">
              Selecting Now
            </p>
            <p className="text-3xl font-bold text-blue-400">
              {stats.seat_selections.length}
            </p>
          </div>
        </div>

        {/* =========================
            Active Holds
        ========================= */}
        {stats.holds.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4">
              Active Seat Holds
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="px-4 py-3 text-slate-400 text-sm font-semibold">
                      Seat
                    </th>
                    <th className="px-4 py-3 text-slate-400 text-sm font-semibold">
                      Held By
                    </th>
                    <th className="px-4 py-3 text-slate-400 text-sm font-semibold">
                      Time Left
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.holds.map((hold) => (
                    <tr key={hold.seat_id} className="border-t border-slate-800/50">
                      <td className="px-4 py-3 text-white font-medium">
                        #{hold.seat_id}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {hold.user_name}
                      </td>
                      <td className="px-4 py-3 text-yellow-400 text-sm font-mono">
                        {formatTime(hold.time_remaining_ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================
            Seat Selections
        ========================= */}
        {stats.seat_selections.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4">
              Currently Selecting
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="px-4 py-3 text-slate-400 text-sm font-semibold">
                      Seat
                    </th>
                    <th className="px-4 py-3 text-slate-400 text-sm font-semibold">
                      User
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.seat_selections.map((sel) => (
                    <tr key={sel.seat_id} className="border-t border-slate-800/50">
                      <td className="px-4 py-3 text-white font-medium">
                        #{sel.seat_id}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {sel.user_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
