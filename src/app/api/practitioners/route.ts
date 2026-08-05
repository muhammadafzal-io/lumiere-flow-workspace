import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { getClinicConfig } from "@/lib/clinic-config";
import {
  activeServicesThatWouldLoseAllPractitioners,
  resolveServiceRecipe,
} from "@/lib/booking/recipe";

export const dynamic = "force-dynamic";

const TABLE = "Practitioners";

function mapRow(r: any) {
  return {
    id: r.id,
    name: r["Name"] ?? "",
    email: r["Email"] ?? "",
    role: r["Role"] ?? "",
    color: r["Color"] ?? "#6366f1",
    specialty: r["Specialty"] ?? "",
    bio: r["Bio"] ?? "",
    status: r["Status"] ?? "Active",
    qualifications: r["Qualifications"] ?? [],
    workingHours: r["WorkingHours"] ?? null,
    breaks: r["Breaks"] ?? null,
    timeOff: r["TimeOff"] ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const sb = getSupabase();
    const {
      name,
      email,
      role,
      color,
      specialty,
      bio,
      qualifications,
      workingHours,
      breaks,
      timeOff,
    } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await sb
      .from(TABLE)
      .insert({
        Name: name.trim().replace(/\s+/g, " "),
        Email: email ?? "",
        Role: role ?? "",
        Color: color ?? "#6366f1",
        Specialty: specialty ?? "",
        Bio: bio ?? "",
        Status: "Active",
        "Calendar ID": null,
        Qualifications: qualifications ?? [],
        WorkingHours: workingHours ?? null,
        Breaks: breaks ?? null,
        TimeOff: timeOff ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    let emailSent = false;
    let emailError: string | undefined;
    const recipientEmail = (email ?? "").trim();
    if (recipientEmail) {
      try {
        const { clinicName } = await getClinicConfig();
        const outcome = await sendRetentionEmail({
          to: recipientEmail,
          subject: `You've been added to the ${clinicName} team`,
          flowType: "general",
          logMeta: {
            category: "general",
            triggerType: "system",
            clientId: data.id,
            clientName: name,
          },
          text: [
            `Hi ${name},`,
            ``,
            `You've been added as a team member at ${clinicName}.`,
            role ? `Role: ${role}` : "",
            specialty ? `Specialty: ${specialty}` : "",
            ``,
            `If you have any questions, reach out to the clinic's admin team.`,
            `— The ${clinicName} Team`,
          ]
            .filter(Boolean)
            .join("\n"),
        });
        emailSent = outcome.sent;
        emailError = outcome.sent ? undefined : outcome.error;
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
      }
      if (!emailSent) {
        console.error(
          `[practitioners] welcome email to ${recipientEmail} was not sent:`,
          emailError,
        );
      }
    }

    return NextResponse.json({ practitioner: mapRow(data), emailSent, emailError });
  } catch (error) {
    console.error("POST /api/practitioners error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = getSupabase();
    const {
      id,
      name,
      email,
      role,
      color,
      specialty,
      bio,
      status,
      qualifications,
      workingHours,
      breaks,
      timeOff,
      force,
    } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (status === "Inactive" && !force) {
      const affected = await activeServicesThatWouldLoseAllPractitioners(id);
      if (affected.length > 0) {
        return NextResponse.json(
          {
            error: `Deactivating this practitioner would leave ${affected.join(", ")} with no qualified practitioner.`,
            affectedServices: affected,
            code: "WOULD_BREAK_ACTIVE_SERVICE",
          },
          { status: 409 },
        );
      }
    }

    if (Array.isArray(qualifications) && !force) {
      const { data: current } = await sb
        .from(TABLE)
        .select("Qualifications")
        .eq("id", id)
        .maybeSingle();
      const previousQualifications: string[] = current?.["Qualifications"] ?? [];
      const removedServiceIds = previousQualifications.filter(
        (serviceId) => !qualifications.includes(serviceId),
      );
      const affected: string[] = [];
      for (const serviceId of removedServiceIds) {
        const recipe = await resolveServiceRecipe(serviceId);
        if (!recipe) continue;
        const stillQualified = recipe.qualifiedPractitioners.some((p) => p.id !== id);
        if (!stillQualified && recipe.qualifiedPractitioners.some((p) => p.id === id)) {
          affected.push(recipe.service.name);
        }
      }
      if (affected.length > 0) {
        return NextResponse.json(
          {
            error: `Removing this qualification would leave ${affected.join(", ")} with no qualified practitioner.`,
            affectedServices: affected,
            code: "WOULD_BREAK_ACTIVE_SERVICE",
          },
          { status: 409 },
        );
      }
    }

    const fields: Record<string, any> = {};
    if (name !== undefined) fields["Name"] = String(name).trim().replace(/\s+/g, " ");
    if (email !== undefined) fields["Email"] = email;
    if (role !== undefined) fields["Role"] = role;
    if (color !== undefined) fields["Color"] = color;
    if (specialty !== undefined) fields["Specialty"] = specialty;
    if (bio !== undefined) fields["Bio"] = bio;
    if (status !== undefined) fields["Status"] = status;
    if (qualifications !== undefined) fields["Qualifications"] = qualifications;
    if (workingHours !== undefined) fields["WorkingHours"] = workingHours;
    if (breaks !== undefined) fields["Breaks"] = breaks;
    if (timeOff !== undefined) fields["TimeOff"] = timeOff;

    const { data, error } = await sb.from(TABLE).update(fields).eq("id", id).select().single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ practitioner: mapRow(data) });
  } catch (error) {
    console.error("PATCH /api/practitioners error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const force = searchParams.get("force") === "true";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (!force) {
      const affected = await activeServicesThatWouldLoseAllPractitioners(id);
      if (affected.length > 0) {
        return NextResponse.json(
          {
            error: `Deleting this practitioner would leave ${affected.join(", ")} with no qualified practitioner.`,
            affectedServices: affected,
            code: "WOULD_BREAK_ACTIVE_SERVICE",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/practitioners error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
