import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// 🔒 URL Lovable HARD-CODÉE (FIX DÉFINITIF)
const PAYMENT_UPDATE_URL =
  "https://parisunlockdoor.lovable.app/functions/v1/payment-update";

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("✅ Stripe event received:", event.type);

  // 🎯 Paiement confirmé
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;

    const caseId = invoice.metadata?.caseId;
    const customerEmail = invoice.customer_email;
    const invoiceId = invoice.id;

    console.log("💰 invoice.paid received", {
      caseId,
      invoiceId,
      customerEmail,
    });

    if (!caseId) {
      console.warn("⚠️ Missing caseId in invoice metadata");
      return res.json({ received: true });
    }

    try {
      // 🔁 UPDATE STATUT DANS LOVABLE
      const response = await fetch(PAYMENT_UPDATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`,
        },
        body: JSON.stringify({
          caseId,
          invoiceId,
        }),
      });

      const text = await response.text();
      console.log("🔁 Lovable response:", response.status, text);

      // 📧 EMAIL CONFIRMATION PAIEMENT
      if (customerEmail) {
        await resend.emails.send({
          from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
          to: [customerEmail],
          subject: "Paiement confirmé – Serrurier Paris Express",
          html: `
            <h2>Paiement confirmé ✅</h2>
            <p>Merci pour votre règlement.</p>
            <p><strong>Montant payé :</strong> ${(invoice.amount_paid / 100).toFixed(2)} €</p>
            <p>
              <a href="${invoice.hosted_invoice_url}">
                👉 Voir votre facture
              </a>
            </p>
            <p>
              Serrurier Paris Express<br/>
              📞 06 49 65 85 10
            </p>
          `,
        });
      }
    } catch (err) {
      console.error("❌ Error processing invoice.paid:", err);
    }
  }

  res.json({ received: true });
}
