import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS (optionnel)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const response = await resend.emails.send({
      // ⚠️ Mets un FROM qui correspond à un domaine VERIFIED dans Resend
      from: "Serrurier Paris Express <contact@parisunlockdoor.fr>",
      to: ["contact@parisunlockdoor.fr"],
      subject: "TEST RESEND DEBUG",
      html: "<p>Test Resend debug</p>",
    });

    // Resend SDK retourne souvent { data, error }
    return res.status(200).json({
      ok: true,
      response,
      resendId: response?.data?.id ?? response?.id ?? null,
      resendError: response?.error ?? null,
    });
  } catch (e) {
    console.error("RESEND THROW:", e);
    return res.status(500).json({
      ok: false,
      message: e?.message || "Unknown error",
      name: e?.name,
      stack: e?.stack,
    });
  }
}
