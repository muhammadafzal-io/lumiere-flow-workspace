/**
 * Named, reusable WhatsApp message templates — each a pure function returning WhatsApp's own
 * markdown flavor (`*bold*`, `_italic_`, plain newlines; WhatsApp does not render HTML). Mirrors
 * how every email message in this codebase is already built (inline template literals via plain
 * functions, no DB-driven CMS) — adding a new notification type is adding one function here.
 */

export const whatsappTemplates = {
  completionLink: (o: {
    clientName?: string;
    clinicName: string;
    treatment?: string;
    url: string;
  }): string =>
    [
      `Hi${o.clientName ? ` ${o.clientName}` : ""}! Thanks for booking with *${o.clinicName}*.`,
      ``,
      `Please finish setting up your appointment${o.treatment ? ` (${o.treatment})` : ""} using the secure link below:`,
      o.url,
    ].join("\n"),

  teamInvite: (o: { name: string; clinicName: string }): string =>
    [
      `Hi ${o.name},`,
      ``,
      `An account has been created for you on the *${o.clinicName}* admin dashboard.`,
      ``,
      `Check your email for your login details and a temporary password.`,
    ].join("\n"),

  practitionerWelcome: (o: {
    name: string;
    clinicName: string;
    role?: string;
    specialty?: string;
  }): string =>
    [
      `Hi ${o.name},`,
      ``,
      `You've been added as a team member at *${o.clinicName}*.`,
      o.role ? `Role: ${o.role}` : "",
      o.specialty ? `Specialty: ${o.specialty}` : "",
    ]
      .filter(Boolean)
      .join("\n"),

  bookingConfirmation: (o: {
    clientName: string;
    clinicName: string;
    treatment: string;
    displayTime: string;
    practitionerName?: string;
  }): string =>
    [
      `Hi ${o.clientName}, your appointment at *${o.clinicName}* is confirmed! ✅`,
      ``,
      `Treatment: ${o.treatment}`,
      `When: ${o.displayTime}`,
      o.practitionerName ? `With: ${o.practitionerName}` : "",
    ]
      .filter(Boolean)
      .join("\n"),

  cancellation: (o: {
    clientName: string;
    clinicName: string;
    treatment: string;
    displayTime: string;
  }): string =>
    [
      `Hi ${o.clientName}, your appointment at *${o.clinicName}* has been cancelled.`,
      ``,
      `Treatment: ${o.treatment}`,
      `Original date: ${o.displayTime}`,
      ``,
      `We'd love to rebook you at a time that works better — just reply here.`,
    ].join("\n"),

  reschedule: (o: {
    clientName: string;
    clinicName: string;
    treatment: string;
    oldDisplayTime?: string;
    newDisplayTime: string;
  }): string =>
    [
      `Hi ${o.clientName}, your *${o.clinicName}* appointment has been rescheduled.`,
      ``,
      `Treatment: ${o.treatment}`,
      o.oldDisplayTime ? `Old date: ${o.oldDisplayTime}` : "",
      `New date: ${o.newDisplayTime}`,
    ]
      .filter(Boolean)
      .join("\n"),
};
