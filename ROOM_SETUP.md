# Room Setup Guide

This guide explains how to configure clinic rooms for appointment availability checking in Lumière Flow.

## Overview

Rooms represent physical spaces where treatments can be performed. The system tracks room availability independently from practitioner availability, allowing:

- Multiple practitioners to use the same room at different times
- One practitioner to use multiple rooms simultaneously (different appointments)
- Real-time availability checking for appointment booking

## Quick Setup

### Option 1: Default Rooms (Easiest)

By default, Lumière Flow ships with two rooms: **Room 1** and **Room 2**.

No configuration needed — start using them immediately in the booking modal.

### Option 2: Custom Rooms via Environment Variables

Set the `CLINIC_ROOMS` environment variable to define your clinic's rooms:

```bash
# .env.local
CLINIC_ROOMS=Room 1,Room 2,VIP Suite,Laser Room,Consultation
```

**Notes:**

- Comma-separated list (no commas within room names)
- Each room name is trimmed of whitespace
- Room names are case-sensitive
- Duplicates are automatically removed

### Option 3: Manage Rooms in Settings UI

1. Go to **Settings** → **Rooms** tab
2. Click **Add new room** to add rooms dynamically
3. Rooms are stored in-memory during the session
4. Click **Save rooms** to persist changes

> **Production Note:** The UI-based room management currently stores rooms in-memory. For production, integrate with your database:
>
> - Store room list in Supabase
> - Update the `/api/settings/rooms` endpoint to persist to DB
> - Sync room changes with Google Calendar metadata

## How Room Availability Works

### 1. Google Calendar Integration

When an appointment is booked:

- An event is created on the clinic's main calendar
- The event description includes the room name:
  ```
  Treatment: Botox
  Client: Sofia Reyes
  Contact: +1-512-555-0101
  Room: Room 1
  Practitioner: Dr. Sofia Marchetti
  Notes: None
  ```

### 2. Availability Checking

When checking available slots:

```bash
GET /api/calendar/slots?date=2026-06-15&duration=60&practitioners=Dr.+Sofia
```

The API returns available time slots with available rooms:

```json
{
  "slots": [
    {
      "startTime": "2026-06-15T15:00:00.000Z",
      "endTime": "2026-06-15T16:00:00.000Z",
      "availableRooms": ["Room 1", "Room 2"],
      "availablePractitioners": ["Dr. Sofia"]
    }
  ]
}
```

### 3. Conflict Detection

During booking, the system checks:

- **Room conflict**: Another appointment in the same room at the same time
- **Practitioner conflict**: The same practitioner booked twice
- **Combo conflict**: Both room AND practitioner are in conflict

Example error messages:

```
"Room 1 is already booked — try a different room"
"Dr. Sofia is already booked — try a different practitioner"
"Room 1 with Dr. Sofia is already booked at this time"
```

## Room Naming Best Practices

✅ **Good examples:**

- Room 1, Room 2, Room 3 (simple, clear)
- VIP Suite, Luxury Room (descriptive)
- Laser Suite, Botox Lab (treatment-specific)
- Main, Annex, East Wing (location-based)

❌ **Avoid:**

- Names with commas (breaks CSV parsing)
- Very long names (UX clutter)
- Special characters (may cause encoding issues)

## Advanced: Multi-Calendar Per Room

For even finer control, you can create a separate Google Calendar for each room and let the system check both:

1. Create a Google Calendar for each room (e.g., "Lumière Room 1", "Lumière Room 2")
2. Set environment variables:
   ```bash
   GOOGLE_ROOM_1_CALENDAR_ID=...
   GOOGLE_ROOM_2_CALENDAR_ID=...
   ```
3. The system will check both the main clinic calendar AND each room's calendar

This prevents:

- Cross-calendar double-booking
- Lost events in the main calendar
- Conflicting edits between different tools

## Troubleshooting

### Rooms aren't showing in the modal

1. Check that rooms are configured in Settings → Rooms
2. Check that a date and practitioner are selected
3. Open browser DevTools → Network tab
4. Check `/api/calendar/slots` response for `availableRooms`

### "No rooms available" error

The system found no available room+practitioner combinations for that time.

- Try a different time or date
- Try a different practitioner
- Check Google Calendar for existing bookings

### Changes to CLINIC_ROOMS aren't reflected

The system reads `CLINIC_ROOMS` at server startup.

- After updating `.env.local`, restart the development server
- In production, redeploy to apply environment changes

## API Reference

### GET /api/settings/rooms

Fetch the current list of rooms.

**Response:**

```json
{
  "rooms": ["Room 1", "Room 2", "VIP Suite"]
}
```

### PATCH /api/settings/rooms

Update the room list.

**Request:**

```json
{
  "rooms": ["Room 1", "Room 2", "VIP Suite"]
}
```

**Response:**

```json
{
  "rooms": ["Room 1", "Room 2", "VIP Suite"],
  "ok": true
}
```

### GET /api/calendar/slots

Check available slots with optional room filtering.

**Query Parameters:**

- `date` (required): YYYY-MM-DD format
- `duration`: minutes (default 60)
- `rooms`: comma-separated room names (optional)
- `practitioners`: comma-separated practitioner names (optional)

**Response includes:**

```json
{
  "slots": [
    {
      "startTime": "...",
      "availableRooms": ["Room 1", "Room 2"],
      "availablePractitioners": ["Dr. Sofia"]
    }
  ]
}
```

## Next Steps

- Configure your clinic's rooms in Settings
- Test booking appointments to verify availability checking
- For production, integrate room persistence with your database
- Consider creating separate room calendars for advanced scheduling
