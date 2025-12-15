import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

// ⚠️ Service role OBLIGATOIRE pour bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
      service
    } = req.body;

    if (!caseId || !customerEmail || !address || !service) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1️⃣ SAUVEGARDE EN BASE (INTERVENTION EN ATTENTE)
    const { error: dbError } = await supabase
      .from("cases")
      .insert([{
        case_id: caseId,
        client_name: customerName || "",
        customer_email: customerEmail,
        customer_phone: customerPhone || "",
        address,
        service,
        status: "PENDING"
      }]);

    if (dbError) {
      console.error("DB insert error:", dbError);
      return res.status(500).json({ error: "Database insert failed" });
    }

    // 2️⃣ EMAIL CLIENT
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      reply_to: "contact@parisunlockdoor.fr",
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

    // 3️⃣ EMAIL INTERNE
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      reply_to: "contact@parisunlockdoor.fr",
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
          <li>Status : PENDING</li>
        </ul>
      `,
    });

    return res.status(200).json({
      success: true,
      status: "PENDING",
      caseId
    });
  } catch (error) {
    console.error("send-estimatif error:", error);
    return res.status(500).json({ error: error.message });
  }
}
