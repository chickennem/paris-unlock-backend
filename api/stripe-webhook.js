import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false, // 🔴 OBLIGATOIRE pour Stripe
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
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
    return res.status(400).send(`Webhook Error`);
  }

  console.log("✅ Stripe event:", event.type);

  try {
    // ===============================
    // 💰 FACTURE PAYÉE
    // ===============================
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      const caseId = invoice.metadata?.caseId;
      const customerEmail = invoice.customer_email;

      console.log("💰 invoice.paid received", {
        caseId,
        invoiceId: invoice.id,
        customerEmail,
      });

      if (!caseId) {
        console.error("⚠️ Missing caseId in metadata");
        return res.status(200).json({ received: true });
      }

      // 🔄 Update Lovable DB
      await fetch(`${process.env.LOVABLE_API_URL}/api/payment-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`,
        },
        body: JSON.stringify({
          caseId,
          status: "TERMINEE",
          invoiceId: invoice.id,
        }),
      });

      // 📧 Email client
      if (customerEmail) {
        await resend.emails.send({
          from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
          to: [customerEmail],
          subject: "Paiement confirmé – Serrurier Paris Express",
          html: `
            <h2>Paiement confirmé ✅</h2>
            <p>Merci pour votre règlement.</p>
            <p>Votre intervention est désormais <strong>terminée</strong>.</p>
            <p>À bientôt,<br/>Serrurier Paris Express</p>
          `,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    // ⚠️ Toujours 200 pour Stripe
    return res.status(200).json({ received: true });
  }
}
