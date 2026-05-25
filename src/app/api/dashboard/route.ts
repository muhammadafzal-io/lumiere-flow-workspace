import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId =  process.env.AIRTABLE_BASE_ID;
  const tableName = "Clients"; // Based on your previous setup

  if (!token || !baseId) {
    return NextResponse.json(
      { error: "Missing Airtable credentials in .env.local" },
      { status: 500 },
    );
  }

  try {
    // 1. Fetch data from Airtable
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableName}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // Revalidate every 60 seconds so your dashboard isn't permanently cached
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Airtable returned status: ${response.status}`);
    }

    const data = await response.json();
    const records = data.records || [];

    const clients = records.map((record: any) => ({
      id: record.id,
      name: record.fields["Name"] || "Unknown",
      phone: record.fields["Phone"] || null,
      telegramId: record.fields["Telegram ID"] || null,
      email: record.fields["Email"] || null,
      lastVisit: record.fields["Last Visit"] || null,
      treatmentInterest: record.fields["Treatment Interest"] || null,
      status: record.fields["Status"] || "Unknown", // "Active", "No-Show", etc.
      appointments: record.fields["Appointments"] || null,
      creditCodes: record.fields["Credit Codes"] || null,
      birthday: record.fields["Birthday"] || null,
      lastReminderSent: record.fields["Last Reminder Sent"] || null,
      lastReactivationSent: record.fields["Last Reactivation Sent"] || null,
      birthdayCreditSent: record.fields["Birthday Credit Sent"] || false,
    }));

    const totalCustomers = clients.length;

    const activeCustomers = clients.filter((c: any) => c.status === "Active").length;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isThisMonth = (dateString: any) => {
      if (!dateString) return false;
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return false;
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    };

    const extractDateFromAppointment = (apptStr: string): string | null => {
      if (!apptStr) return null;
      // Match: Day Mon DD, YYYY HH:MM AM/PM  (e.g. Thu May 21, 2026 11:30 AM)
      const match = apptStr.match(
        /[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/i,
      );
      if (match) return match[0];
      // Fallback: if the whole string is already a valid date, use it
      const trimmed = apptStr.trim();
      if (!isNaN(new Date(trimmed).getTime())) return trimmed;
      return null;
    };

    const getStartOfWeek = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday is first day of week
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };

    const getEndOfWeek = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff + 6);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    };

    const startOfCurrentWeek = getStartOfWeek(now);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const isThisWeek = (dateString: any) => {
      if (!dateString) return false;
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return false;
      const time = date.getTime();
      return time >= startOfCurrentWeek && time <= endOfToday.getTime();
    };

    let messagesSentThisMonth = 0;
    let appointmentsThisWeek = 0;

    clients.forEach((c: any) => {
      if (isThisMonth(c.lastReminderSent)) {
        messagesSentThisMonth++;
      }
      if (isThisMonth(c.lastReactivationSent)) {
        messagesSentThisMonth++;
      }

      if (Array.isArray(c.appointments)) {
        // FIX 3: extract parseable date from each array entry
        c.appointments.forEach((appt: any) => {
          const dateStr = extractDateFromAppointment(String(appt));
          if (dateStr && isThisWeek(dateStr)) appointmentsThisWeek++;
        });
      } else if (typeof c.appointments === "string") {
        const apptDates = c.appointments.split(";");
        apptDates.forEach((apptDate: string) => {
          const dateStr = extractDateFromAppointment(apptDate.trim());
          if (dateStr && isThisWeek(dateStr)) appointmentsThisWeek++;
        });
      }
    });

    // 4. Return the structured data to your frontend
    return NextResponse.json({
      metrics: {
        totalCustomers,
        activeCustomers,
        messagesSentThisMonth,
        appointmentsThisWeek,
      },
      clients: clients,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
