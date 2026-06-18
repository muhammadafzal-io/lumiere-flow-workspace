# Rooms Database Architecture & Changes

## Current System Overview

### Where Rooms Are Stored

**Currently (In-Memory Only):**

```typescript
// File: src/app/api/settings/rooms/route.ts
let storedRooms: string[] = ["Room 1", "Room 2"]; // ← In-memory, lost on restart!
```

**Problem:** Rooms are stored in memory only and lost when the server restarts. This is a temporary solution.

### How Rooms Flow Through the System

```
Settings Page (UI)
    ↓
User adds/edits room
    ↓
PATCH /api/settings/rooms
    ↓
storedRooms array updated (in-memory)
    ↓
Calendar uses rooms for availability
    ↓
Server restarts
    ↓
Rooms reset to default ["Room 1", "Room 2"] ❌
```

## What Happens When You Add a New Room

### Current (In-Memory) System

**Step 1: User Action**

1. Open Settings → Rooms tab
2. Click "Add room" or edit room list
3. Type new room name (e.g., "Treatment Pod A")
4. Click "Save rooms"

**Step 2: API Call**

```typescript
PATCH /api/settings/rooms
{
  "rooms": ["Room 1", "Room 2", "Treatment Pod A"]
}
```

**Step 3: In-Memory Update**

```typescript
storedRooms = ["Room 1", "Room 2", "Treatment Pod A"];
```

**Step 4: Available Immediately**

- Calendar shows new room in dropdowns ✅
- Availability checking includes new room ✅
- Booking accepts new room ✅

**Step 5: Server Restarts**

- **All new rooms lost** ❌
- Reset to default: `["Room 1", "Room 2"]`

### Database Changes Required (Production)

To make rooms persistent, you need a database table:

```sql
-- Rooms table
CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  clinic_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  capacity INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);
```

## Complete Data Flow With Database

### Adding a New Room (With Persistent Database)

```
Settings UI
    ↓
User enters "Treatment Pod A"
    ↓
Click "Save rooms"
    ↓
PATCH /api/settings/rooms
{
  "rooms": ["Room 1", "Room 2", "Treatment Pod A"]
}
    ↓
Backend (Updated)
├─ Validate room names
├─ Remove duplicates
├─ INSERT into database:
│  INSERT INTO rooms (clinic_id, name) VALUES ('clinic-123', 'Treatment Pod A')
└─ Return success
    ↓
Frontend
└─ Show toast: "Rooms saved"
    ↓
Calendar Page
├─ Fetches availability
├─ Query: SELECT * FROM rooms WHERE is_active = true
├─ Now includes "Treatment Pod A"
└─ Shows in dropdowns
    ↓
Google Calendar Integration
├─ When booking, saves room to event metadata:
│  Event description: "Room: Treatment Pod A"
└─ When rescheduling, preserves room name
    ↓
Next Day
├─ Server restarts
├─ Rooms fetched from database
└─ "Treatment Pod A" still there ✅
```

## Current vs. Production Architecture

| Aspect               | Current (In-Memory) | Production (Database) |
| -------------------- | ------------------- | --------------------- |
| **Storage**          | RAM only            | Supabase/Database     |
| **Persistence**      | Lost on restart ❌  | Permanent ✅          |
| **Scaling**          | Single server only  | Multiple servers ✅   |
| **API Calls**        | No database hit     | Fast DB query         |
| **Room History**     | None                | Can track changes     |
| **Room Soft Delete** | Not possible        | `is_active` flag      |
| **Room Capacity**    | Fixed (1)           | Configurable          |
| **Room Description** | Not stored          | Stored & searchable   |

## Files Involved in Room Management

### 1. Settings API (Rooms Update)

**File:** `src/app/api/settings/rooms/route.ts`

```typescript
// GET - Fetch current rooms
GET /api/settings/rooms
→ { "rooms": ["Room 1", "Room 2"] }

// PATCH - Update rooms
PATCH /api/settings/rooms
{
  "rooms": ["Room 1", "Room 2", "New Room"]
}
→ { "rooms": [...], "ok": true }
```

**Current Implementation:**

```typescript
let storedRooms = ["Room 1", "Room 2"]; // In-memory

export async function PATCH(req) {
  // TODO: In production, persist to database
  storedRooms = uniqueRooms;
  return NextResponse.json({ rooms: storedRooms, ok: true });
}
```

### 2. Settings Page (Rooms UI)

**File:** `src/app/(admin)/settings/page-client.tsx` (Lines 542-650)

```typescript
function RoomsTab({ rooms, onSaved }) {
  const [form, setForm] = useState<string[]>(rooms);

  const save = async () => {
    const res = await fetch("/api/settings/rooms", {
      method: "PATCH",
      body: JSON.stringify({ rooms: form }),
    });
    // Update local state with response
  };

  return (
    // UI for adding/editing/removing rooms
  );
}
```

**Features:**

- Add room: Click button, type name, save
- Remove room: Click X next to room name
- Duplicate detection: Automatic
- Validation: Non-empty, string type

### 3. Calendar Integration

**File:** `src/lib/integrations/google-calendar.ts`

```typescript
function getDefaultRooms(): string[] {
  const roomsEnv = process.env.CLINIC_ROOMS;
  return roomsEnv ? roomsEnv.split(",").map((r) => r.trim()) : ["Room 1", "Room 2"];
}

const DEFAULT_ROOMS = getDefaultRooms();
```

**Used for:**

- Availability checking
- Booking validation
- Calendar event metadata
- Dropdown options in UI

### 4. Booking Service

**File:** `src/lib/services/booking-service.ts`

```typescript
// When booking, validates room exists in DEFAULT_ROOMS
if (!DEFAULT_ROOMS.includes(request.room)) {
  throw new Error("Selected room is not available");
}
```

## How Room Names Are Used in Google Calendar

When an appointment is created, the room is stored in the Google Calendar event:

```typescript
// In Google Calendar event metadata
{
  summary: "Microneedling - Dr Robio",
  description: "Room: Treatment Pod A\nClient: John Doe\nNotes: ...",
  // ...other fields
}
```

When appointments are fetched back, the room is extracted:

```typescript
const room = e.room || ""; // "Treatment Pod A"
```

## Making Rooms Persistent (Implementation Steps)

### Step 1: Create Database Table

```sql
CREATE TABLE clinics_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  capacity INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clinic_id, name)
);
```

### Step 2: Update API Endpoint

```typescript
// src/app/api/settings/rooms/route.ts
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(/* config */);
  const { data, error } = await supabase
    .from("clinics_rooms")
    .select("name")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return NextResponse.json({ rooms: data.map((r) => r.name) });
}

export async function PATCH(req: NextRequest) {
  const { rooms } = await req.json();
  const supabase = createClient(/* config */);

  // Get clinic ID from auth
  const clinicId = getClinicIdFromAuth(req);

  // Delete old, insert new
  await supabase.from("clinics_rooms").delete().eq("clinic_id", clinicId);

  await supabase.from("clinics_rooms").insert(
    rooms.map((name) => ({
      clinic_id: clinicId,
      name: name.trim(),
    })),
  );

  return NextResponse.json({ rooms, ok: true });
}
```

### Step 3: Update Calendar Utils

```typescript
// src/lib/integrations/google-calendar.ts
async function getDefaultRooms(): Promise<string[]> {
  const res = await fetch("/api/settings/rooms");
  const data = await res.json();
  return data.rooms || ["Room 1", "Room 2"];
}

// Use with await
const DEFAULT_ROOMS = await getDefaultRooms();
```

## Current Behavior Summary

When you add a new room:

✅ **Works:**

- Room appears in UI dropdowns
- Can book appointments with new room
- Calendar shows availability for new room
- Reschedule works with new room

❌ **Doesn't Work:**

- Rooms not saved to database
- Lost on server restart
- Not accessible from other servers/deployments
- No history of room changes
- Can't soft-delete (archive) rooms

## To Fix This (Production-Ready)

1. **Create database table** for rooms
2. **Update API endpoint** to read/write to database
3. **Update calendar utils** to fetch rooms dynamically
4. **Add room deletion** with soft-delete flag
5. **Add room metadata** (capacity, description, etc.)
6. **Add room history** for audit trail

## TODO Comment in Code

There's already a TODO in the rooms API:

```typescript
// TODO: In production, store in database and update CLINIC_ROOMS env var or config
// Location: src/app/api/settings/rooms/route.ts:34
```

This is the main work item to make rooms persistent.

## Summary

| Question                               | Answer                                      |
| -------------------------------------- | ------------------------------------------- |
| **Where do rooms go when I add them?** | In-memory array in the API, lost on restart |
| **How do I make them permanent?**      | Add to database (TODO item)                 |
| **Does booking work with new rooms?**  | Yes, while server is running                |
| **Are new rooms saved after restart?** | No, reset to default                        |
| **How many rooms can I add?**          | Unlimited (currently)                       |
| **Can I delete rooms?**                | Yes, from UI (but not persisted)            |
| **Do other users see new rooms?**      | Yes (while server running)                  |
| **What's the database model?**         | Needs `clinics_rooms` table                 |
