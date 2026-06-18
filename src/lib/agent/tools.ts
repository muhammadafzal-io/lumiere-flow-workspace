import type { ChatCompletionTool } from "openai/resources";

export const TOOLS: ChatCompletionTool[] = [
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
      name: "book_appointment",
      description:
        "Create a confirmed appointment in the Lumière Google Calendar with room and practitioner assignment. Only call after the client has confirmed a specific slot from check_availability results. If room/practitioner not specified, the system will automatically assign an available one.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Full name of the client" },
          treatment: { type: "string", description: "Name of the treatment being booked" },
          date_time: { type: "string", description: "Appointment start time in ISO 8601 format" },
          duration_minutes: { type: "number", description: "Duration in minutes" },
          client_contact: { type: "string", description: "Client phone number or Telegram ID" },
          practitioner_name: {
            type: "string",
            description:
              "Name of the practitioner (from check_availability results). If omitted, system picks first available.",
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
        required: ["client_name", "treatment", "date_time", "duration_minutes", "client_contact"],
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
        "Create a new client record or update an existing one in Airtable. Call as soon as you know the client's name (even before booking), and again after collecting phone/email. Pass platform user ID (Discord ID, Telegram ID) as telegram_id. The returned id field is the Airtable record ID — store it and pass it as client_id in every subsequent log_operation call.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          telegram_id: {
            type: "string",
            description: "Platform user ID — Discord user ID, Telegram ID, or similar",
          },
          last_visit: { type: "string", description: 'Date only, YYYY-MM-DD, e.g. "2026-05-17"' },
          last_treatment: { type: "string", description: 'Treatment name, e.g. "Botox"' },
          birthday: { type: "string", description: 'MM-DD format, e.g. "03-15"' },
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
        "Check whether a client's credit or promo code is valid and how much discount it provides. Call this whenever a client mentions they have a birthday credit, promo code, or discount code. Returns validity, client name, credit amount, and expiry. Do NOT redeem — only validate.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "The credit or promo code exactly as the client provided it (e.g. BDAY-MA-IP1L)",
          },
        },
        required: ["code"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Post an escalation alert in the Lumière #lumiere-escalations Slack channel so a human team member can follow up. Use when the agent cannot or should not answer.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Why this is being escalated (specific, one sentence)",
          },
          client_info: {
            type: "string",
            description: "Name, Telegram handle, or phone of the client",
          },
          conversation_summary: {
            type: "string",
            description: "Brief summary of the conversation so the human has context",
          },
        },
        required: ["reason", "conversation_summary"],
      },
    },
  },
];
