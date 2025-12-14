import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 🔓 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      caseId,
      customerName,
      customerEmail,
      customerPhone,
      address,
      service
    } = req.body;

    if (!caseId || !customerEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 📧 Email client
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Devis estimatif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Devis estimatif</h2>
        <p>Bonjour ${customerName || ""},</p>

        <p><strong>Intervention :</strong> ${service}</p>
        <p><strong>Adresse :</strong> ${address}</p>

        <p><strong>Tarifs à partir de :</strong></p>
        <ul>
          <li>Ouverture de porte : à partir de <strong>90 €</strong></li>
          <li>Changement de serrure : à partir de <strong>150 €</strong></li>
        </ul>

        <p>
          ⚠️ Annulation après déplacement : <strong>69 €</strong>
        </p>

        <p>
          📞 06 49 65 85 10<br/>
          Serrurier Paris Express
        </p>
      `,
    });

    // 📧 Email interne
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@parisunlockdoor.fr>",
      to: ["contact@parisunlockdoor.fr"],
      subject: `NOUVELLE DEMANDE – ${service} (${caseId})`,
      html: `
        <h3>Nouvelle demande reçue</h3>
        <ul>
          <li>Client : ${customerName}</li>
          <li>Email : ${customerEmail}</li>
          <li>Téléphone : ${customerPhone}</li>
          <li>Adresse : ${address}</li>
          <li>Dossier : ${caseId}</li>
        </ul>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("send-estimatif error:", error);
    return res.status(500).json({ error: error.message });
  }
}
