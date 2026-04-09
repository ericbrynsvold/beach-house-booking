import { Resend } from "resend";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export async function sendGuestMagicLink(params: {
  to: string;
  manageUrl: string;
}): Promise<{ ok: boolean; devLink?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) {
    console.warn(
      "[mail] RESEND_API_KEY or RESEND_FROM missing; magic link:",
      params.manageUrl,
    );
    return { ok: false, devLink: params.manageUrl };
  }

  const safeUrl = escapeHtml(params.manageUrl);
  const html = `<p>You can view and edit the bookings tied to this email:</p><p><a href="${safeUrl}">Open your bookings</a></p><p>This link expires in 14 days.</p>`;
  const text = `Manage your beach house bookings:\n${params.manageUrl}\n\nThis link expires in 14 days.`;

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: "Manage your beach house visit bookings",
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
