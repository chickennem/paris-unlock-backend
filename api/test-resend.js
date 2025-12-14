import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 🔓 CORS (pour tests navigateur si besoin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await resend.emails.send({
      from: "Serrurier Paris Express <contact@parisunlockdoor.fr>",
      to: ["contact@parisunlockdoor.fr"], // 🔁 destinataire de test
      subject: "TEST RESEND – Email de validation",
      html: `
        <h2>Test Resend OK</h2>
        <p>Si tu reçois cet email, alors :</p>
        <ul>
          <li>✅ Resend fonctionne</li>
          <li>✅ Le domaine est validé</li>
          <li>✅ OVH reçoit les emails</li>
        </ul>

        <p>
          Date : ${new Date().toLocaleString("fr-FR")}
        </p>

        <p>
          —<br/>
          Serrurier Paris Express<br/>
          06 49 65 85 10
        </p>
      `,
    });

    return res.status(200).json({
      success: true,
      resendId: result.id || null,
    });
  } catch (error) {
    console.error("test-resend error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
