import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false, // 🔴 OBLIGATOIRE
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Lire le RAW BODY (clé de la signature Stripe)
 */
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    console.error("❌ Missing stripe-signature header");
    return res.status(400).send("Missing stripe-signature");
  }

  let event;

  try {
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("✅ Stripe signature verified:", event.type);

  // =================================================
  // 🎯 FACTURE PAYÉE
  // =================================================
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const invoice = event.data.object;

    const caseId = invoice.metadata?.caseId;
    const invoiceId = invoice.id;
    const customerEmail = invoice.customer_email;

    console.log("💰 invoice.payment_succeeded received", {
      caseId,
      invoiceId,
      customerEmail,
    });

    if (!caseId) {
      console.warn("⚠️ Missing caseId");
      return res.json({ received: true });
    }

    // 🔁 UPDATE LOVABLE
    await fetch(`${process.env.LOVABLE_API_URL}/~api/payment-update`, {
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
    });

    // 📧 EMAIL CLIENT
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Paiement confirmé – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Paiement confirmé ✅</h2>
        <p>Votre paiement a bien été reçu.</p>
        <p>
          <a href="${invoice.hosted_invoice_url}">Voir la facture</a>
        </p>
      `,
    });
  }

  // ⚠️ TOUJOURS répondre 200 à Stripe
  res.json({ received: true });
}
