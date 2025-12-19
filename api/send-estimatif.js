import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 🔓 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
      service,
      estimatedPrice // 👈 PRIX ESTIMATIF TTC
    } = req.body;

    // 🔎 VALIDATIONS
    if (!caseId || !customerEmail || !service || !estimatedPrice) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const price = Number(estimatedPrice);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: "Invalid estimatedPrice" });
    }

    // ===============================
    // 📧 EMAIL CLIENT — DEVIS ESTIMATIF
    // ===============================
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Devis estimatif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Devis estimatif</h2>
        <p>Bonjour ${customerName || ""},</p>

        <p><strong>Intervention :</strong> ${service}</p>
        <p><strong>Adresse :</strong> ${address || "-"}</p>

        <p style="font-size:16px">
          <strong>Prix estimatif :</strong>
          ${price.toFixed(2)} € TTC
        </p>

        <p style="font-size:13px;color:#666">
          Le prix définitif sera confirmé sur place après diagnostic.
        </p>

        <p>
          ⚠️ Annulation après déplacement :
          <strong>69 €</strong>
        </p>

        <p>
          📞 06 49 65 85 10<br/>
          Serrurier Paris Express
        </p>
      `,
    });

    // ===============================
    // 📧 EMAIL INTERNE
    // ===============================
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      to: ["contact@parisunlockdoor.fr"],
      subject: `NOUVELLE DEMANDE – ${service} (${caseId})`,
      html: `
        <h3>Nouvelle demande reçue</h3>
        <ul>
          <li><strong>Dossier :</strong> ${caseId}</li>
          <li><strong>Client :</strong> ${customerName || "-"}</li>
          <li><strong>Email :</strong> ${customerEmail}</li>
          <li><strong>Téléphone :</strong> ${customerPhone || "-"}</li>
          <li><strong>Adresse :</strong> ${address || "-"}</li>
          <li><strong>Service :</strong> ${service}</li>
          <li><strong>Prix estimatif :</strong> ${price.toFixed(2)} € TTC</li>
        </ul>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ send-estimatif error:", error);
    return res.status(500).json({ error: error.message });
  }
}
