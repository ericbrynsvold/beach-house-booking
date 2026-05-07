import { Resend } from "resend";
import type { HalfSlot } from "@/db/schema";
import { TRIP_PROPERTY_MAPS_URL } from "@/lib/property-info";
import { slotSortKey } from "@/lib/slots";

const RESEND_DISPLAY_NAME = "2026 Brynsvold Beach House";
const SUBJECT_NEW_BOOKING = "Beach House Booking Confirmation";
const SUBJECT_STAY_UPDATED = "Beach House Stay Updated";
const SIGN_OFF = "Eric, Rachel, Chloe, & Evie";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** Use configured mailbox but force the visible sender name. */
function buildResendFrom(): string | null {
  const raw = process.env.RESEND_FROM?.trim();
  if (!raw) return null;
  const bracket = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (bracket) {
    return `${RESEND_DISPLAY_NAME} <${bracket[2]!.trim()}>`;
  }
  if (raw.includes("@")) {
    return `${RESEND_DISPLAY_NAME} <${raw}>`;
  }
  return null;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatStaySummaryForEmail(
  slots: { dateLocal: string; slot: HalfSlot }[],
): string {
  if (slots.length === 0) return "No nights on file yet.";
  const sorted = [...slots].sort(
    (a, b) =>
      slotSortKey(a.dateLocal, a.slot) - slotSortKey(b.dateLocal, b.slot),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const nights = slots.length / 2;

  if (first.dateLocal === last.dateLocal) {
    if (first.slot !== last.slot) {
      return `Full calendar day on ${formatLongDate(first.dateLocal)} (morning through evening).`;
    }
    return `Part of ${formatLongDate(first.dateLocal)} (${first.slot === "am" ? "morning" : "afternoon / evening"} only).`;
  }

  const startPhrase =
    first.slot === "pm"
      ? `arriving the afternoon or evening of ${formatLongDate(first.dateLocal)}`
      : `arriving the morning of ${formatLongDate(first.dateLocal)}`;
  const endPhrase =
    last.slot === "am"
      ? `leaving the morning of ${formatLongDate(last.dateLocal)}`
      : `through the afternoon of ${formatLongDate(last.dateLocal)}`;

  const nightWord = nights === 1 ? "1 night" : `${nights} nights`;
  return `${nightWord} on the calendar—from ${startPhrase}, through ${endPhrase}.`;
}

function formatResourceNamesHtml(names: string[]): string {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return escapeHtml("Your space");
  if (trimmed.length === 1) return escapeHtml(trimmed[0]!);
  return `<ul style="margin:0.35em 0 0 1.1em;padding:0;">${trimmed
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("")}</ul>`;
}

function formatResourceNamesText(names: string[]): string {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return "Your space";
  if (trimmed.length === 1) return trimmed[0]!;
  return trimmed.map((n) => `• ${n}`).join("\n");
}

type ReservationEmailKind = "booking" | "update";

async function sendReservationDetailsEmail(params: {
  kind: ReservationEmailKind;
  to: string;
  guestName: string;
  resourceNames: string[];
  slots: { dateLocal: string; slot: HalfSlot }[];
  manageUrl: string;
  propertyAddress: string;
}): Promise<{ ok: boolean; devLink?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = buildResendFrom();
  if (!key || !from) {
    console.warn(
      "[mail] RESEND_API_KEY or RESEND_FROM missing; manage link:",
      params.manageUrl,
    );
    return { ok: false, devLink: params.manageUrl };
  }

  const subject =
    params.kind === "update" ? SUBJECT_STAY_UPDATED : SUBJECT_NEW_BOOKING;

  const safeName = escapeHtml(params.guestName.trim());
  const resourceHtml = formatResourceNamesHtml(params.resourceNames);
  const stayText = formatStaySummaryForEmail(params.slots);
  const safeStayHtml = escapeHtml(stayText);
  const safeUrl = escapeHtml(params.manageUrl);
  const addr = params.propertyAddress.trim();
  const safeAddr = escapeHtml(addr);

  const safeMapsUrl = escapeHtml(TRIP_PROPERTY_MAPS_URL);

  const addressBlockHtml = addr
    ? `<p><strong>Address</strong><br />${safeAddr.replace(/\n/g, "<br />")}</p><p><a href="${safeMapsUrl}">Open in Google Maps</a> (same as on the Trip info page).</p>`
    : `<p><strong>Address</strong><br />We’ll share the exact location closer to the trip—reply to this thread or ask one of us if you need it sooner.</p>`;

  const addressBlockText = addr
    ? `Address:\n${addr}\nGoogle Maps: ${TRIP_PROPERTY_MAPS_URL}\n`
    : `Address:\nWe’ll share the exact location closer to the trip—reply or ask one of us if you need it sooner.\n`;

  const resourceText = formatResourceNamesText(params.resourceNames);

  const introHtml =
    params.kind === "update"
      ? `<p>You’ve <strong>updated</strong> your stay on the beach house calendar. Here’s your revised confirmation with the new dates:</p>`
      : `<p>Thanks for booking at the beach house. Here’s a confirmation of what we saved for you:</p>`;

  const introText =
    params.kind === "update"
      ? `You've updated your stay on the beach house calendar. Here's your revised confirmation with the new dates:`
      : `Thanks for booking at the beach house. Here's a confirmation of what we saved for you:`;

  const html = `
<p>Hi ${safeName},</p>
${introHtml}
<p><strong>Where you’re sleeping</strong><br />${resourceHtml}</p>
<p><strong>Your stay</strong><br />${safeStayHtml}</p>
${addressBlockHtml}
<p><strong>Need to change something again?</strong><br />
<a href="${safeUrl}">View or update your bookings</a> (everything under this email address is on one page). The link is valid for about 14 days—open it again from a fresh booking email anytime.</p>
<p>We’re glad you’re joining us.</p>
<p>— ${escapeHtml(SIGN_OFF)}</p>
`.trim();

  const text = `Hi ${params.guestName.trim()},

${introText}

Where you're sleeping
${resourceText}

Your stay
${stayText}

${addressBlockText}
Need to change something again?
View or update your bookings (everything under this email address):
${params.manageUrl}

The link is valid for about 14 days—you can open it again from a fresh booking email anytime.

We're glad you're joining us.

— ${SIGN_OFF}
`.trim();

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[mail] Resend error:", error.message, error.name);
      return { ok: false, devLink: params.manageUrl };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mail] send failed:", e);
    return { ok: false, devLink: params.manageUrl };
  }
}

export async function sendBookingConfirmationEmail(params: {
  to: string;
  guestName: string;
  resourceNames: string[];
  slots: { dateLocal: string; slot: HalfSlot }[];
  manageUrl: string;
  propertyAddress: string;
}): Promise<{ ok: boolean; devLink?: string }> {
  return sendReservationDetailsEmail({ kind: "booking", ...params });
}

export async function sendStayUpdateConfirmationEmail(params: {
  to: string;
  guestName: string;
  resourceNames: string[];
  slots: { dateLocal: string; slot: HalfSlot }[];
  manageUrl: string;
  propertyAddress: string;
}): Promise<{ ok: boolean; devLink?: string }> {
  return sendReservationDetailsEmail({ kind: "update", ...params });
}
