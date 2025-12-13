import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    caseId,
    customerName,
    customerEmail,
    customerPhone,
    address,
    service
  } = req.body;

  if (!customerEmail || !caseId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 📧 Email CLIENT
    await resend.emails.send({
      from: "Serrurier Paris Express <devis@mail.parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Devis estimatif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Devis estimatif – Prix à partir de</h2>
        <p>Bonjour ${customerName || ""},</p>

        <p>Nous avons bien reçu votre demande pour :</p>
        <ul>
          <li><strong>Intervention :</strong> ${service}</li>
          <li><strong>Adresse :</strong> ${address}</li>
        </ul>

        <p><strong>Tarifs à partir de :</strong></p>
        <ul>
          <li>Ouverture de porte : <strong>à partir de 90 €</strong></li>
          <li>Changement de serrure : <strong>à partir de 150 €</strong></li>
        </ul>

        <p>
          ⚠️ Le tarif définitif sera confirmé sur place après diagnostic.<br/>
          ⚠️ En cas d’annulation après déplacement, des frais de <strong>69 €</strong> seront facturés.
        </p>

        <p>
          📞 Besoin d’aide immédiate ? Appelez le <strong>06 49 65 85 10</strong>
        </p>

        <p>
          —<br/>
          Serrurier Paris Express
        </p>
      `,
    });

    // 📧 Email INTERNE
    await resend.emails.send({
      from: "Serrurier Paris Express <devis@mail.parisunlockdoor.fr>",
      to: ["contact@parisunlockdoor.fr"],
      subject: `NOUVELLE DEMANDE – ${service} (${caseId})`,
      html: `
        <h3>Nouvelle demande reçue</h3>
        <ul>
          <li><strong>Client :</strong> ${customerName}</li>
          <li><strong>Email :</strong> ${customerEmail}</li>
          <li><strong>Téléphone :</strong> ${customerPhone}</li>
          <li><strong>Adresse :</strong> ${address}</li>
          <li><strong>Service :</strong> ${service}</li>
          <li><strong>Dossier :</strong> ${caseId}</li>
        </ul>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Erreur envoi devis estimatif:", error);
    return res.status(500).json({ error: "Email failed" });
  }
}
