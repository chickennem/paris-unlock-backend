import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      caseId,
      customerName,
      customerEmail,
      customerPhone,
      address,
      service
    } = req.body;

    if (!caseId || !customerEmail || !address || !service) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      reply_to: "contact@parisunlockdoor.fr",
      to: [customerEmail, "contact@parisunlockdoor.fr"],
      subject: `Devis estimatif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Devis estimatif</h2>
        <p><strong>Dossier :</strong> ${caseId}</p>
        <p><strong>Intervention :</strong> ${service}</p>
        <p><strong>Adresse :</strong> ${address}</p>
        <p>📞 06 49 65 85 10</p>
      `,
    });

    return res.status(200).json({
      success: true,
      caseId,
      status: "EMAIL_SENT"
    });
  } catch (e) {
    console.error("send-estimatif error:", e);
    return res.status(500).json({ error: e.message });
  }
}
