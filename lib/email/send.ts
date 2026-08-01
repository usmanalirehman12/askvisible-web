export type EmailMessage = { to: string; subject: string; text: string };
export type SendResult = { sent: boolean; skipped?: "not-configured"; error?: string };

// Plain fetch rather than the Resend SDK: this is one POST, and staying dependency-free
// keeps the module usable from the Edge runtime as well as Node.
const ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}

// Never throws. This is called from the cron loop, where an email problem must not take
// down a scan that already succeeded — the scan is the valuable part, the alert is a
// courtesy. Callers get a result they can log and move on.
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, skipped: "not-configured" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.ALERT_FROM_EMAIL,
        to: [message.to],
        subject: message.subject,
        text: message.text
      })
    });

    if (!response.ok) {
      // Resend puts the useful part in the body — a bare status tells you nothing about
      // whether it's an unverified domain, a bad key, or a malformed address.
      const detail = await response.text().catch(() => "");
      return { sent: false, error: `Resend ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}` };
    }

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Email send failed." };
  }
}
