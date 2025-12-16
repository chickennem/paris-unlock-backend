import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false, // 🔥 OBLIGATOIRE POUR STRIPE
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Lire le body brut EXACT (signature Stripe)
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    req.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      console.error("❌ Missing stripe-signature header");
      return res.status(400).send("Missing Stripe signature");
    }

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("✅ Stripe signature verified:", event.type);
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // 🎯 PAIEMENT CONFIRMÉ
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      const caseId = invoice.metadata?.caseId;
      const customerEmail =
        invoice.customer_email ||
        invoice.customer_details?.email;

      console.log("💰 invoice.paid received", {
        caseId,
        invoiceId: invoice.id,
        customerEmail,
      });

      // Sécurité minimale
      if (!caseId || !customerEmail) {
        console.error("❌ Missing caseId or customerEmail");
        return res.status(200).json({ received: true });
      }

      // 1️⃣ EMAIL CLIENT + INTERNE
      const emailResult = await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        reply_to: "contact@parisunlockdoor.fr",
        to: [customerEmail, "contact@parisunlockdoor.fr"],
        subject: `Paiement confirmé – Serrurier Paris Express (${caseId})`,
        html: `
          <h2>Paiement confirmé ✅</h2>

          <p>
            Nous confirmons la bonne réception de votre paiement
            pour l’intervention <strong>${caseId}</strong>.
          </p>

          <p>
            👉 <a href="${invoice.hosted_invoice_url}">
              Voir la facture
            </a>
          </p>

          <p>
            Merci pour votre confiance.<br/>
            <strong>Serrurier Paris Express</strong><br/>
            📞 06 49 65 85 10
          </p>
        `,
      });

      console.log("📧 Resend result:", emailResult);

      // 2️⃣ UPDATE STATUT DANS LOVABLE
      const lovableResponse = await fetch(
        "https://parisunlockdoor.lovable.app/api/payment-update",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`,
          },
          body: JSON.stringify({
            caseId,
            invoiceId: invoice.id,
            eventId: event.id,
          }),
        }
      );

      const lovableText = await lovableResponse.text();
      console.log("🔁 Lovable response:", lovableResponse.status, lovableText);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
