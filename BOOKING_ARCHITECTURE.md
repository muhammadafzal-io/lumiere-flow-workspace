# Unified Booking Architecture

This document explains how appointment booking works across the system with room and practitioner availability awareness.

## Overview

The system uses a **unified booking service** that both the admin UI and chatbot leverage to ensure consistency:

```
┌─────────────────┐                    ┌──────────────────┐
│   Admin UI      │                    │   Chatbot Agent  │
└────────┬────────┘                    └────────┬─────────┘
         │                                      │
         │  POST /api/calendar/book             │
         │  (with room + practitioner)          │
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │  Unified Booking Service     │
          │  (booking-service.ts)        │
          │                              │
          │  • checkAvailability()       │
          │  • bookAppointment()         │
          │  • suggestSlot()             │
          └──────────────┬───────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
    Google Calendar            Conflict Detection
    (Events w/ metadata)       (Room + Practitioner)
```

## Components

### 1. Booking Service (`src/lib/services/booking-service.ts`)

**Purpose:** Single source of truth for booking logic

**Key Functions:**

#### `checkAvailability(request)`

Checks available slots with room/practitioner awareness.

```typescript
// Input
{
  date: "2026-06-15",
  durationMinutes: 60,
  practitionerName?: "Dr. Sofia",    // Optional filter
  room?: "Room 1"                     // Optional filter
}

// Output
{
  date: "2026-06-15",
  durationMinutes: 60,
  slots: [
    {
      startTime: "2026-06-15T15:00:00Z",
      endTime: "2026-06-15T16:00:00Z",
      displayTime: "Monday, Jun 15, 10:00 AM CDT",
      availableRooms: ["Room 1", "Room 2"],      // ← Which rooms free at this time
      availablePractitioners: ["Dr. Sofia", "Maya"]  // ← Which practitioners free
    }
  ],
  availablePractitioners: ["Dr. Sofia", "Maya"],      // ← All practitioners free on date
  availableRooms: ["Room 1", "Room 2"]                // ← All rooms free on date
}
```

#### `bookAppointment(request)`

Books appointment with full validation.

```typescript
// Input
{
  clientName: "Sofia Reyes",
  clientContact: "+1-512-555-0101",
  treatment: "Botox",
  startTime: "2026-06-15T15:00:00Z",
  endTime: "2026-06-15T16:00:00Z",
  practitionerName: "Dr. Sofia",      // ← Required (from availability)
  room: "Room 1",                     // ← Required (from availability)
  notes: "First time client"
}

// Output
{
  id: "google_event_id_123",
  clientName: "Sofia Reyes",
  treatment: "Botox",
  startTime: "2026-06-15T15:00:00Z",
  endTime: "2026-06-15T16:00:00Z",
  practitionerName: "Dr. Sofia",
  room: "Room 1"
}

// Throws if conflict:
// "Room 1 with Dr. Sofia is already booked at this time"
// "Room 1 is already booked — try a different room"
// "Dr. Sofia is already booked — try a different practitioner"
```

#### `suggestSlot(request)`

AI-friendly: Recommends the best available slot (used by chatbot).

```typescript
// Input
{
  date: "2026-06-15",
  durationMinutes: 45,
  preferredPractitioner?: "Dr. Sofia",
  preferredRoom?: "Room 1"
}

// Output
{
  slot: { /* first available slot */ },
  practitioner: "Dr. Sofia",           // ← Auto-selected if preferred not available
  room: "Room 1",
  suggestion: "Monday, Jun 15, 10:00 AM CDT with Dr. Sofia in Room 1"
}
```

### 2. Admin Booking Flow

**File:** `src/components/calendar/AppointmentDialogs.tsx`

**Flow:**

1. User selects date → `useEffect` fetches available slots via `/api/calendar/slots`
2. User selects practitioner & treatment → updates available rooms
3. UI shows only available rooms
4. User clicks "Create appointment" → `POST /api/calendar/book`
5. API uses `bookAppointment()` service → validates room+practitioner combo
6. Success → appointment in Google Calendar with room/practitioner metadata

**Example Request:**

```bash
POST /api/calendar/book
{
  "clientName": "Sofia Reyes",
  "clientContact": "+1-512-555-0101",
  "treatment": "Botox",
  "startTime": "2026-06-15T15:00:00Z",
  "endTime": "2026-06-15T16:00:00Z",
  "practitionerName": "Dr. Sofia Marchetti",
  "room": "Room 1",
  "notes": ""
}
```

### 3. Chatbot Booking Flow

**File:** `src/lib/agent/index.ts`

**Agent Tools:**

#### `check_availability` Tool

```typescript
{
  name: "check_availability",
  parameters: {
    date: "2026-06-15",                    // Required
    duration_minutes: 60,                  // Optional (default 60)
    preferred_practitioner: "Dr. Sofia",   // Optional filter
    preferred_room: "Room 1"               // Optional filter
  }
}
```

**Agent Flow:**

1. Client says "Book me Botox next Monday"
2. Agent calls `check_availability` with treatment duration
3. Receives available slots + available practitioners + available rooms
4. Agent suggests best slot to client
5. Client confirms
6. Agent calls `book_appointment` with confirmed slot

#### `book_appointment` Tool

```typescript
{
  name: "book_appointment",
  parameters: {
    client_name: "Sofia Reyes",            // Required
    treatment: "Botox",                    // Required
    date_time: "2026-06-15T15:00:00Z",    // Required (ISO 8601)
    duration_minutes: 60,                  // Required
    client_contact: "+1-512-555-0101",    // Required
    practitioner_name: "Dr. Sofia",        // Optional (auto-selected if omitted)
    room: "Room 1",                        // Optional (auto-selected if omitted)
    notes: "New client, sensitive skin"    // Optional
  }
}
```

**Smart Auto-Selection:**

- If `practitioner_name` not provided → system picks first available
- If `room` not provided → system picks first available
- If both missing → `suggestSlot()` auto-selects both intelligently

### 4. Google Calendar Metadata

Events created by the system include room/practitioner info in description:

```
Treatment: Botox
Client: Sofia Reyes
Contact: +1-512-555-0101
Room: Room 1
Practitioner: Dr. Sofia Marchetti
Notes: New client, sensitive skin
```

This metadata is parsed by `parseDesc()` in `google-calendar.ts` to enable conflict detection.

## Conflict Detection Algorithm

When checking availability or booking, the system:

1. **Fetches all events** in the time range from Google Calendar
2. **Parses metadata** (room, practitioner) from each event description
3. **Checks for overlaps:**
   - If event has room metadata: blocks that room
   - If event has practitioner metadata: blocks that practitioner
   - If event has NO metadata (legacy): blocks both room + practitioner (conservative)
4. **Returns available combos** where both room AND practitioner are free

**Examples:**

| Time  | Event                              | Room 1 | Room 2 | Dr. Sofia | Maya |
| ----- | ---------------------------------- | ------ | ------ | --------- | ---- |
| 10:00 | None                               | ✓      | ✓      | ✓         | ✓    |
| 11:00 | Botox w/ Dr. Sofia in Room 1       | ✗      | ✓      | ✗         | ✓    |
| 12:00 | HydraFacial w/ Dr. Sofia in Room 2 | ✓      | ✗      | ✗         | ✓    |
| 1:00  | None                               | ✓      | ✓      | ✓         | ✓    |

**Available slots:**

- 10:00: All combinations available
- 11:00: Only Room 2 + Maya available
- 12:00: Only Room 1 + Maya available
- 1:00: All combinations available

## Data Flow: New Appointment

### Admin UI Path:

```
1. User clicks "New Appointment"
   ↓
2. Modal loads, user selects practitioner + treatment
   ↓
3. useEffect calls /api/calendar/slots?date=...&practitioners=Dr.+Sofia&duration=60
   ↓
4. API calls checkAvailability() → returns slots with availableRooms
   ↓
5. Room dropdown shows [Room 1, Room 2]
   ↓
6. User selects Room 1, clicks "Create"
   ↓
7. POST /api/calendar/book
   ↓
8. API calls bookAppointment()
   ↓
9. bookAppointment() calls bookAdminAppointment()
   ↓
10. Event created in Google Calendar with room/practitioner metadata
   ↓
11. UI updates with confirmation
```

### Chatbot Path:

```
1. Client: "I want to book Botox"
   ↓
2. Agent calls check_availability(date=..., duration_minutes=60)
   ↓
3. Agent gets slots with availablePractitioners + availableRooms
   ↓
4. Agent suggests: "I found slots on Jun 15. How about 10 AM with Dr. Sofia in Room 1?"
   ↓
5. Client: "Perfect!"
   ↓
6. Agent calls book_appointment(
     date_time=...,
     practitioner_name="Dr. Sofia",
     room="Room 1"
   )
   ↓
7. bookAppointment() validates availability
   ↓
8. Event created in Google Calendar
   ↓
9. Agent: "Booked! Your Botox is confirmed for Jun 15, 10 AM with Dr. Sofia."
```

## Key Advantages

✅ **Single Source of Truth** - Both UI and chatbot use same booking logic
✅ **Conflict Prevention** - No double-booking of room+practitioner combos
✅ **Intelligent Defaults** - Chatbot auto-selects rooms/practitioners if not specified
✅ **Real-time Availability** - Checks Google Calendar, no separate DB
✅ **Extensible** - Easy to add rules (e.g., "Dr. Sofia only books in Room 1")
✅ **Audit Trail** - All booking metadata in Google Calendar for compliance

## Troubleshooting

### Booking fails: "Room X is not available"

- Client tried to book a room that's already occupied
- Solution: Check `/api/calendar/slots?date=...` for actually available rooms

### Chatbot books wrong room/practitioner

- Agent didn't call `check_availability` before `book_appointment`
- Solution: Review agent logs, ensure tool order is correct

### Legacy events causing false conflicts

- Old Google Calendar events without room/practitioner metadata
- Solution: Edit old events to add metadata, or manually update if critical

## Future Enhancements

- [ ] Room capacity (multiple people per room simultaneously)
- [ ] Practitioner specialization (only Dr. Sofia does Botox)
- [ ] Room features (which rooms have lasers, etc.)
- [ ] Preferred slot recommendations (ML-based)
- [ ] Buffer time between appointments (recovery time)
- [ ] Integration with Supabase for audit logging
