"use client";

import { useEffect, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
};

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const stored = localStorage.getItem("user");

    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <nav className="border-b border-slate-800 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="text-xl font-bold text-white"
        >
          Smart Seat Booking
        </button>

        <div className="flex items-center gap-3">
          {!mounted ? (
            <button
              onClick={() => {
                window.location.href = "/login";
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
            >
              Login
            </button>
          ) : user ? (
            <>
              <div className="hidden sm:flex flex-col items-end gap-1">
                <p className="text-sm text-white font-medium">
                  {user.name}
                </p>
                <p className="text-xs text-slate-400">
                  {user.email}
                </p>
              </div>

              <button
                onClick={() => {
                  window.location.href = "/my-bookings";
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition"
              >
                My Bookings
              </button>

              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                window.location.href = "/login";
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
            >
              Login
            </button>
          )}
        </div>

      </div>
    </nav>
  );
}
