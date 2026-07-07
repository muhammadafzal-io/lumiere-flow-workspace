import type { ChatCompletionTool } from "openai/resources";

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_practitioners",
      description:
        "Get the list of active practitioners at Lumière. Call this after the client states their treatment so you can offer a practitioner preference. Returns name, specialty, and bio for each active practitioner.",
      parameters: {
        type: "object",
        properties: {
          specialty: {
            type: "string",
            description:
              'Optional treatment keyword to filter practitioners (e.g. "Botox", "Microneedling"). Omit to get all active practitioners.',
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Check available appointment slots in the Lumière Google Calendar for a given date, considering both room and practitioner availability. Returns available time slots and which rooms/practitioners are free. ALWAYS call this before suggesting any time to a client.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date to check in YYYY-MM-DD format (Austin, TX local date)",
          },
          duration_minutes: {
            type: "number",
            description: "Duration of the treatment in minutes. Defaults to 60 if unknown.",
          },
          preferred_practitioner: {
            type: "string",
            description:
              "If the client prefers a specific practitioner, pass their full name here to filter availability",
          },
          practitioner_name: {
            type: "string",
            description:
              "Active practitioner PERSON from get_practitioners (e.g. Dr. Dao) — NEVER the treatment or service name (e.g. not 'Laser Hair Removal' or 'Botox'). Omit if the client has no practitioner preference.",
          },
          preferred_room: {
            type: "string",
            description:
              "If the client prefers a specific room, pass it here (e.g. 'Room 1', 'VIP Suite')",
          },
        },
        required: ["date"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "find_earliest_availability",
      description:
        "Find the soonest available appointment slots starting from TODAY (then tomorrow, etc.). REQUIRED when the client asks for earliest, soonest, next available, ASAP, or first open slot. Searches day-by-day automatically — do not skip ahead to dates 3–4 days out without checking today and tomorrow first.",
      parameters: {
        type: "object",
        properties: {
          duration_minutes: {
            type: "number",
            description: "Duration of the treatment in minutes. Defaults to 60 if unknown.",
          },
          preferred_practitioner: {
            type: "string",
            description: "Optional practitioner name to filter availability",
          },
          practitioner_name: {
            type: "string",
            description: "Alias for preferred_practitioner",
          },
          preferred_room: {
            type: "string",
            description: "Optional room name to filter availability",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Create a confirmed appointment in the Lumière Google Calendar with room and practitioner assignment. Only call after the client has confirmed a specific slot from check_availability results. Requires full name (first and last), phone, email, and birthday (YYYY-MM-DD).",
      parameters: {
        type: "object",
        properties: {
          client_name: {
            type: "string",
            description:
              "Client's full legal name — first and last (e.g. Sarah Johnson). Single first names are rejected.",
          },
          treatment: { type: "string", description: "Name of the treatment being booked" },
          date_time: {
            type: "string",
            description:
              "EXACT startTime ISO from check_availability / find_earliest_availability for the slot the client chose. Do not invent from spoken time alone.",
          },
          date: {
            type: "string",
            description:
              "Appointment date YYYY-MM-DD (Austin). Pass with date_time when the client confirmed a day (e.g. tomorrow).",
          },
          duration_minutes: { type: "number", description: "Duration in minutes" },
          client_contact: { type: "string", description: "Client phone number or Telegram ID" },
          client_email: {
            type: "string",
            description:
              "REQUIRED — confirmed email for booking confirmation. Remove ALL spaces (e.g. talhaazeem@gmail.com, never talha azeem@gmail.com).",
          },
          birthday: {
            type: "string",
            description:
              "REQUIRED — client's date of birth in YYYY-MM-DD format (also save via upsert_client before booking)",
          },
          practitioner_name: {
            type: "string",
            description:
              "Practitioner PERSON from get_practitioners or check_availability results — NEVER the treatment name. Omit if unknown.",
          },
          room: {
            type: "string",
            description:
              "Room name (from check_availability results, e.g. 'Room 1'). If omitted, system picks first available.",
          },
          notes: {
            type: "string",
            description: "Optional notes (new client, contraindication mentions, preferences)",
          },
        },
        required: [
          "client_name",
          "treatment",
          "date_time",
          "duration_minutes",
          "client_contact",
          "client_email",
          "birthday",
        ],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "resend_booking_confirmation",
      description:
        "Re-send the booking confirmation email — REQUIRED when the client corrects or updates their email after an appointment was already booked. Updates the calendar event and client record, then emails the new address. Only tell the client the confirmation was sent after this tool returns confirmation_email_sent: true.",
      parameters: {
        type: "object",
        properties: {
          client_email: {
            type: "string",
            description: "Corrected email address to send the confirmation to",
          },
          event_id: {
            type: "string",
            description:
              "Google Calendar event ID from book_appointment (event_id field). Preferred when available.",
          },
          client_contact: {
            type: "string",
            description:
              "Client phone — used to find their upcoming appointment if event_id is not known",
          },
        },
        required: ["client_email"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "find_upcoming_appointment",
      description:
        "Look up an EXISTING upcoming appointment for cancel or reschedule ONLY. NEVER during a NEW booking — if the client is booking a new visit or picking a practitioner, use check_availability instead. Returns treatment, time, event_id from phone.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Client phone number — only field required",
          },
          client_contact: {
            type: "string",
            description: "Alias for phone — pass phone here if that is what you collected",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "check_reschedule_availability",
      description:
        "Check open slots when RESCHEDULING an existing appointment ONLY — NEVER for a new booking. Requires phone + new date. If the client is booking new or chose a practitioner for a new visit, use check_availability instead.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Client phone number — used to load their existing appointment",
          },
          client_contact: {
            type: "string",
            description: "Alias for phone",
          },
          date: {
            type: "string",
            description: "New date to check in YYYY-MM-DD (Austin)",
          },
        },
        required: ["date"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Cancel an existing appointment. Pass phone OR client_contact — system looks up the appointment automatically. Optional event_id if you already have it from find_upcoming_appointment or book_appointment. NEVER ask for name or email. Confirm with the client before calling.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Client phone number — used to find their upcoming appointment",
          },
          client_contact: {
            type: "string",
            description: "Alias for phone",
          },
          event_id: {
            type: "string",
            description:
              "Optional — from find_upcoming_appointment or book_appointment; else from phone",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description:
        "Reschedule an existing appointment. ONLY phone + new_date_time required (exact startTime from check_reschedule_availability). System looks up appointment and emails confirmation. NEVER ask for name, email, birthday, or event_id.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Client phone number — used to find their upcoming appointment",
          },
          client_contact: {
            type: "string",
            description: "Alias for phone — pass phone here if that is what you collected",
          },
          new_date_time: {
            type: "string",
            description: "EXACT startTime ISO from check_availability for the new slot",
          },
          date: {
            type: "string",
            description: "New appointment date YYYY-MM-DD (Austin) — pass with new_date_time",
          },
          duration_minutes: {
            type: "number",
            description: "Duration in minutes (default from original treatment)",
          },
          event_id: {
            type: "string",
            description: "Optional — from find_upcoming_appointment; else auto-filled from phone",
          },
        },
        required: ["new_date_time"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "lookup_client",
      description:
        "Look up an existing client record in Airtable by platform user ID or phone number. Returns client details including last visit and treatment history.",
      parameters: {
        type: "object",
        properties: {
          telegram_id: {
            type: "string",
            description:
              "Platform user ID — Telegram ID, Discord user ID, or similar unique identifier",
          },
          phone: { type: "string", description: "Phone number (any format)" },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "upsert_client",
      description:
        "Create a new client record or update an existing one in Airtable. Call as soon as you have the client's full name (first and last — required), and again after collecting phone/email. Pass platform user ID (Discord ID, Telegram ID) as telegram_id. The returned id field is the Airtable record ID — store it and pass it as client_id in every subsequent log_operation call.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Full legal name — first and last (e.g. Michael Smith). Single first names are rejected.",
          },
          phone: { type: "string" },
          email: {
            type: "string",
            description: "No spaces before @ — e.g. talhaazeem@gmail.com",
          },
          telegram_id: {
            type: "string",
            description: "Platform user ID — Discord user ID, Telegram ID, or similar",
          },
          last_visit: { type: "string", description: 'Date only, YYYY-MM-DD, e.g. "2026-05-17"' },
          last_treatment: { type: "string", description: 'Treatment name, e.g. "Botox"' },
          birthday: { type: "string", description: 'YYYY-MM-DD format, e.g. "1990-03-15"' },
          status: { type: "string", enum: ["Active", "Dormant", "No-show", "Discard"] },
          notes: { type: "string" },
          appointments: {
            type: "string",
            description: 'Short appointment summary, e.g. "Botox — Sat May 17, 2026 12:00 PM CT"',
          },
        },
        required: ["name"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "log_operation",
      description:
        "Append a row to the Google Sheets operations log. Call after every booking, escalation, and significant event. ALWAYS pass client_id using the id field returned by upsert_client. ALWAYS pass phone and email if you have them.",
      parameters: {
        type: "object",
        properties: {
          event_type: {
            type: "string",
            enum: [
              "booking",
              "escalation",
              "inquiry",
              "no-show",
              "noshow-recovery",
              "reminder",
              "reactivation",
              "birthday",
            ],
          },
          client_name: {
            type: "string",
            description:
              'Client full name ONLY — e.g. "Michael Smith". Never include phone or email here; use the phone and email fields below.',
          },
          client_id: {
            type: "string",
            description:
              "Airtable record ID — use the id value returned by upsert_client. Required for website and Discord bookings.",
          },
          phone: {
            type: "string",
            description:
              "Client phone number — always include if collected. Separate field, never inside client_name.",
          },
          email: {
            type: "string",
            description:
              "Client email address — always include if collected. Separate field, never inside client_name.",
          },
          details: { type: "string", description: "Human-readable description of what happened" },
          status: { type: "string", enum: ["success", "pending", "failed"] },
          platform: {
            type: "string",
            description: "telegram | whatsapp | discord | widget | system",
          },
        },
        required: ["event_type", "client_name", "details"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "validate_credit_code",
      description:
        "Check whether a promo code is valid for THIS client's phone: birthday credits (BDAY-…, must match code owner), rule codes (e.g. CREDIT200, SAVE30 — active rule + phone on file), or loyalty codes (CAMP-…, must match owner). REQUIRED: collect phone first — pass phone with code.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "The promo code exactly as the client provided it (e.g. BDAY-M-K8R9, SAVE30, CAMP-JS-ABC123)",
          },
          phone: {
            type: "string",
            description:
              "REQUIRED — client phone number. Code is validated against this phone (must match the client who received or owns the code).",
          },
          client_contact: {
            type: "string",
            description: "Alias for phone if already collected in the booking flow",
          },
        },
        required: ["code", "phone"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Post an escalation alert in the Lumière #lumiere-escalations Slack channel so a human team member can follow up. REQUIRED: full name, phone, and email must be collected first — the system blocks escalation without them.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Why this is being escalated (specific, one sentence)",
          },
          client_name: {
            type: "string",
            description: "Client's full legal name — first and last (required)",
          },
          phone: {
            type: "string",
            description: "Client phone number (required)",
          },
          client_email: {
            type: "string",
            description: "Client email address — no spaces before @ (required)",
          },
          conversation_summary: {
            type: "string",
            description: "Brief summary of the conversation so the human has context",
          },
          client_info: {
            type: "string",
            description: "Deprecated — use client_name, phone, and client_email instead",
          },
        },
        required: ["reason", "client_name", "phone", "client_email", "conversation_summary"],
      },
    },
  },
];
