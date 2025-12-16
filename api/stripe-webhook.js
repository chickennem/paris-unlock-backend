import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false, // 🔴 OBLIGATOIRE pour Stripe
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const LOVABLE_API_URL =
  process.env.LOVABLE_API_URL || "https://parisunlockdoor.lovable.app";

/**
 * Lire le body brut (signature Stripe)
 */
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let event;

  try {
    const buf = await buffer(req);
    const sig = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("✅ Stripe event received:", event.type);
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send("Webhook Error");
  }

  try {
    // ==================================================
    // 💰 FACTURE PAYÉE
    // ==================================================
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      const caseId = invoice.metadata?.caseId;
      const invoiceId = invoice.id;
      const customerEmail =
        invoice.customer_email ||
        invoice.customer_details?.email;

      console.log("💰 invoice.paid received", {
        caseId,
        invoiceId,
        customerEmail,
      });

      if (!caseId) {
        console.error("⚠️ Missing caseId in invoice metadata");
        return res.status(200).json({ received: true });
      }

      // 🔄 UPDATE STATUT DANS LOVABLE
      try {
        const response = await fetch(
          `${LOVABLE_API_URL}/api/payment-update`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`,
            },
            body: JSON.stringify({
              caseId,
              status: "TERMINEE",
              invoiceId,
            }),
          }
        );

        const text = await response.text();
        console.log("🔁 Lovable response:", response.status, text);
      } catch (err) {
        console.error("❌ Lovable update error:", err);
      }

      // 📧 EMAIL PAIEMENT CONFIRMÉ (CLIENT + INTERNE)
      if (customerEmail) {
        console.log("📧 Preparing payment confirmation email");

        try {
          const emailResult = await resend.emails.send({
            from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
            reply_to: "contact@parisunlockdoor.fr",
            to: [
              customerEmail,
              "contact@parisunlockdoor.fr",
            ],
            subject: `Paiement confirmé – Serrurier Paris Express (${caseId})`,
            html: `
              <h2>Paiement confirmé ✅</h2>

              <p>
                Nous confirmons la réception de votre paiement
                pour le dossier <strong>${caseId}</strong>.
              </p>

              <p>
                L’intervention est désormais <strong>terminée</strong>.
              </p>

              <p>
                Merci pour votre confiance.<br/>
                <strong>Serrurier Paris Express</strong><br/>
                📞 06 49 65 85 10
              </p>
            `,
          });

          console.log("📧 Resend success:", emailResult);
        } catch (err) {
          console.error("❌ Resend error (payment email):", err);
        }
      } else {
        console.warn("⚠️ No customerEmail, email not sent");
      }
    }

    // ⚠️ Toujours répondre 200 à Stripe
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    return res.status(200).json({ received: true });
  }
}
