# Rooms as Database Column (Simpler Approach)

## Database Schema

Instead of a separate table, add a column to the existing `clinics` table:

```sql
-- Add to existing clinics table
ALTER TABLE clinics ADD COLUMN rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2']::TEXT[];
```

Or with JSONB (more flexible):

```sql
-- Alternative: JSONB for more metadata
ALTER TABLE clinics ADD COLUMN rooms JSONB DEFAULT '[{"name": "Room 1"}, {"name": "Room 2"}]'::JSONB;
```

## Simpler Option: Array Column

**Recommended** - Simple array of room names:

```sql
CREATE TABLE clinics (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2'],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## How Data Looks

**Clinics Table:**

```
id                | name        | rooms
------------------+-------------+---------------------
clinic-123        | Lumière     | ["Room 1", "Room 2", "Treatment Pod A"]
clinic-456        | Other Clinic| ["Studio A", "Studio B"]
```

## Database Changes When Adding Room

```
User adds "Treatment Pod A"
         ↓
PATCH /api/settings/rooms
{
  "rooms": ["Room 1", "Room 2", "Treatment Pod A"]
}
         ↓
Backend Query:
UPDATE clinics
SET rooms = ARRAY['Room 1', 'Room 2', 'Treatment Pod A']::TEXT[]
WHERE id = 'clinic-123'
         ↓
Database stores:
clinics.rooms = ["Room 1", "Room 2", "Treatment Pod A"]
         ↓
Next time server starts:
SELECT rooms FROM clinics WHERE id = 'clinic-123'
→ Returns: ["Room 1", "Room 2", "Treatment Pod A"]
         ↓
✅ Rooms persist permanently!
```

## Updated API Endpoint

```typescript
// src/app/api/settings/rooms/route.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function GET(req: NextRequest) {
  const clinicId = getClinicIdFromAuth(req); // Get from JWT

  const { data, error } = await supabase
    .from("clinics")
    .select("rooms")
    .eq("id", clinicId)
    .single();

  if (error) {
    console.error("[/api/settings/rooms] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rooms", code: "FETCH_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ rooms: data?.rooms || [] });
}

export async function PATCH(req: NextRequest) {
  const clinicId = getClinicIdFromAuth(req);
  const { rooms } = await req.json();

  if (!Array.isArray(rooms) || rooms.length === 0) {
    return NextResponse.json(
      { error: "rooms must be a non-empty array", code: "INVALID_ROOMS" },
      { status: 400 },
    );
  }

  // Validate each room
  if (!rooms.every((r) => typeof r === "string" && r.trim().length > 0)) {
    return NextResponse.json(
      { error: "each room must be a non-empty string", code: "INVALID_ROOM_NAME" },
      { status: 400 },
    );
  }

  // Remove duplicates and sort
  const uniqueRooms = Array.from(new Set(rooms.map((r) => r.trim()))).sort();

  // Update database
  const { data, error } = await supabase
    .from("clinics")
    .update({ rooms: uniqueRooms })
    .eq("id", clinicId)
    .select("rooms")
    .single();

  if (error) {
    console.error("[/api/settings/rooms] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update rooms", code: "UPDATE_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ rooms: data?.rooms || [], ok: true });
}
```

## Comparison: Table vs Column

| Aspect            | Separate Table                                       | Column in clinics                        |
| ----------------- | ---------------------------------------------------- | ---------------------------------------- |
| **Complexity**    | More complex                                         | Simple ✅                                |
| **Query**         | `SELECT name FROM clinics_rooms WHERE clinic_id = ?` | `SELECT rooms FROM clinics WHERE id = ?` |
| **Add Room**      | INSERT new row                                       | UPDATE array column                      |
| **Remove Room**   | DELETE row                                           | UPDATE array (remove element)            |
| **Scalability**   | Better for 1000+ rooms                               | Good for <100 rooms                      |
| **Room Metadata** | Easy to add (capacity, description)                  | Complex (need JSONB)                     |
| **Database Size** | More rows                                            | Fewer rows                               |
| **Performance**   | Slower for many rooms                                | Faster for few rooms                     |

## Migration SQL

If you already have a `clinics` table, add the column:

```sql
-- Simple array
ALTER TABLE clinics ADD COLUMN rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2'];

-- Update existing clinics
UPDATE clinics SET rooms = ARRAY['Room 1', 'Room 2'] WHERE rooms IS NULL;
```

## Data Flow After Implementation

```
Settings Page
    ↓
User adds "Treatment Pod A"
    ↓
Click "Save rooms"
    ↓
PATCH /api/settings/rooms
{
  "rooms": ["Room 1", "Room 2", "Treatment Pod A"]
}
    ↓
Backend:
UPDATE clinics
SET rooms = ['Room 1', 'Room 2', 'Treatment Pod A']
WHERE id = 'clinic-123'
    ↓
Database:
clinics table, room column updated ✅
    ↓
Calendar:
SELECT rooms FROM clinics WHERE id = 'clinic-123'
→ Returns: ['Room 1', 'Room 2', 'Treatment Pod A']
    ↓
Dropdowns Updated ✅
    ↓
Server Restarts
    ↓
SELECT rooms FROM clinics WHERE id = 'clinic-123'
→ Still returns: ['Room 1', 'Room 2', 'Treatment Pod A']
    ↓
✅ Rooms persist permanently!
```

## Files to Update

### 1. Database Schema (One-time)

```sql
ALTER TABLE clinics ADD COLUMN rooms TEXT[];
```

### 2. API Endpoint

`src/app/api/settings/rooms/route.ts` → See updated code above

### 3. Calendar Integration

```typescript
// src/lib/integrations/google-calendar.ts
async function getDefaultRooms(clinicId: string): Promise<string[]> {
  const res = await fetch("/api/settings/rooms");
  const data = await res.json();
  return data.rooms || ["Room 1", "Room 2"];
}
```

## Example: Room Operations

### Add a Room

```typescript
// Current rooms: ["Room 1", "Room 2"]
// User adds: "Treatment Pod A"
const newRooms = ["Room 1", "Room 2", "Treatment Pod A"];

const res = await fetch("/api/settings/rooms", {
  method: "PATCH",
  body: JSON.stringify({ rooms: newRooms }),
});

// Database updates:
// UPDATE clinics SET rooms = ['Room 1', 'Room 2', 'Treatment Pod A']
```

### Remove a Room

```typescript
// Current rooms: ["Room 1", "Room 2", "Treatment Pod A"]
// User removes: "Treatment Pod A"
const newRooms = ["Room 1", "Room 2"];

const res = await fetch("/api/settings/rooms", {
  method: "PATCH",
  body: JSON.stringify({ rooms: newRooms }),
});

// Database updates:
// UPDATE clinics SET rooms = ['Room 1', 'Room 2']
```

### Rename a Room

```typescript
// Current: ["Room 1", "Room 2"]
// Rename "Room 2" to "Treatment Suite"
const newRooms = ["Room 1", "Treatment Suite"];

const res = await fetch("/api/settings/rooms", {
  method: "PATCH",
  body: JSON.stringify({ rooms: newRooms }),
});

// Database updates:
// UPDATE clinics SET rooms = ['Room 1', 'Treatment Suite']
```

## If You Need More Metadata Later

You can always upgrade to JSONB:

```sql
-- Later, if you need room capacity, description, etc.
ALTER TABLE clinics
DROP COLUMN rooms;

ALTER TABLE clinics
ADD COLUMN rooms JSONB DEFAULT '[
  {"name": "Room 1", "capacity": 1, "description": ""},
  {"name": "Room 2", "capacity": 1, "description": ""}
]'::JSONB;
```

Then query like:

```typescript
const rooms = data?.rooms?.map((r) => r.name) || [];
```

## Summary

**Column Approach Benefits:**
✅ Simple - one column in existing table
✅ Fast queries - SELECT rooms FROM clinics
✅ Less database overhead
✅ Easy to understand
✅ Sufficient for <100 rooms per clinic
✅ Can upgrade to JSONB later if needed

**When to use Separate Table:**
❌ If you need 100+ rooms per clinic
❌ If each room has lots of metadata (capacity, features, photos)
❌ If you need room history/audit trail
❌ If you want to track room availability separately

**Recommendation:** Use column approach for now, upgrade to table later if needed.
