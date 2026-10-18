# Real-Time Seat Booking Management System

A full-stack seat booking application built to solve common problems in online reservation systems, including double booking, outdated seat availability, and booking conflicts between multiple users.

## Problem Statement

In a traditional seat booking system, multiple users may try to reserve the same seat at the same time. Without proper synchronization, this can lead to double bookings, outdated availability information, and inconsistent booking records.

This project explores how to address these problems using database transactions, real-time communication, and temporary seat reservations.

## Problems Solved

- **Double-booking prevention:** Uses atomic database operations to prevent multiple users from booking the same available seat.
- **Real-time seat availability:** Updates seat status across connected clients using Socket.IO without requiring a page refresh.
- **Temporary seat holds:** Temporarily reserves seats while users make booking decisions.
- **Automatic hold expiration:** Releases expired holds and notifies connected clients.
- **Booking cancellation:** Allows users to cancel their confirmed bookings and makes the corresponding seats available again.
- **Personal booking management:** Users can view and manage their own bookings.
- **Live admin monitoring:** Provides an admin dashboard for monitoring booking activity and seat availability.
- **Authentication:** Uses JWT-based authentication to protect booking-related operations.

## Key Features

- Interactive seat selection interface
- Available, selected, and booked seat indicators
- Real-time booking and cancellation events
- Temporary seat reservation with countdown
- Live user presence and seat-selection indicators
- Booking history and cancellation
- Admin dashboard
- REST API integration
- PostgreSQL database transactions

## Tech Stack

**Frontend**
- Next.js
- React
- TypeScript
- Tailwind CSS
- Socket.IO Client

**Backend**
- Node.js
- Express.js
- Socket.IO
- JWT Authentication

**Database**
- PostgreSQL

## What I Learned

Building this project helped me understand:

- How to handle concurrent booking requests
- Why atomic database operations and transactions matter
- How to synchronize application state across multiple clients
- How to implement temporary reservations and expiration logic
- How to handle booking cancellation consistently
- How frontend applications communicate with REST APIs and WebSocket events
- How to separate authentication, booking logic, and real-time updates

## Future Improvements

- Persistent temporary holds across server restarts
- Stronger concurrency handling for hold expiration and release
- Automated integration and concurrency tests
- Production deployment with environment-specific configuration
- Improved monitoring, logging, and error handling

## Project Goal

The goal of this project was to build a practical reservation system while developing a deeper understanding of backend engineering, database consistency, and real-time application design.
