import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

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
      service,
      selectedOptions,
      estimatedTotal,
    } = req.body;

    // 🔎 Validations
    if (!caseId || !customerEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (
      !Array.isArray(selectedOptions) ||
      selectedOptions.length === 0 ||
      typeof estimatedTotal !== "number"
    ) {
      return res.status(400).json({
        error: "Invalid estimation data",
      });
    }

    // 🗄️ Sauvegarde DB
    const { error: insertError } = await supabase.from("cases").insert({
      case_id: caseId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      address,
      service,
      selected_options: selectedOptions,
      estimated_total: estimatedTotal,
      status: "DEVIS_ESTIMATIF_ENVOYE",
    });

    if (insertError) {
      console.error("DB insert error:", insertError);
      return res.status(500).json({ error: "Database error" });
    }

    // 🧾 HTML options
    const optionsHtml = selectedOptions
      .map(
        (o) => `<li>${o.label} — <strong>${o.price} €</strong></li>`
      )
      .join("");

    // 📧 Email client
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Devis estimatif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Votre devis estimatif</h2>
        <p>Bonjour ${customerName || ""},</p>

        <p><strong>Adresse :</strong> ${address}</p>

        <h3>Détail de votre estimation</h3>
        <ul>${optionsHtml}</ul>

        <p>
          <strong>Total estimatif HT : ${estimatedTotal.toFixed(2)} €</strong>
        </p>

        <p style="font-size:12px;color:#666">
          Prix estimatif. Le devis définitif sera confirmé après diagnostic sur place.
        </p>

        <p>
          📞 06 49 65 85 10<br/>
          Serrurier Paris Express
        </p>
      `,
    });

    // 📧 Email interne
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      to: ["contact@parisunlockdoor.fr"],
      subject: `NOUVELLE DEMANDE – ${service} (${caseId})`,
      html: `
        <h3>Nouvelle demande reçue</h3>
        <ul>
          <li><strong>Client :</strong> ${customerName}</li>
          <li><strong>Email :</strong> ${customerEmail}</li>
          <li><strong>Téléphone :</strong> ${customerPhone}</li>
          <li><strong>Adresse :</strong> ${address}</li>
        </ul>

        <h4>Options sélectionnées</h4>
        <ul>${optionsHtml}</ul>

        <p><strong>Total estimatif HT : ${estimatedTotal.toFixed(2)} €</strong></p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("send-estimatif error:", error);
    return res.status(500).json({ error: error.message });
  }
}
