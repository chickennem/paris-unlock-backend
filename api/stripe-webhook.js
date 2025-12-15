import Stripe from "stripe";
import { Resend } from "resend";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

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
    console.error("❌ Stripe signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // ✅ Paiement confirmé sur une facture Stripe
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      // IMPORTANT : nécessite metadata.case_id dans create-final-invoice.js
      const caseId = invoice?.metadata?.case_id;
      const invoiceId = invoice?.id;
      const eventId = event?.id;

      if (!caseId) {
        console.warn("⚠️ invoice.paid sans metadata.case_id, invoiceId:", invoiceId);
      } else {
        // 1) Mettre à jour Lovable automatiquement
        const lovableUrl = process.env.LOVABLE_BASE_URL || "https://parisunlockdoor.fr";
        const r = await fetch(`${lovableUrl}/api/payment-update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": process.env.PAYMENT_UPDATE_SECRET,
          },
          body: JSON.stringify({
            caseId,
            stripeInvoiceId: invoiceId,
            stripeEventId: eventId,
          }),
        });

        const text = await r.text();
        if (!r.ok) {
          console.error("❌ Lovable update failed:", r.status, text);
          // On ne throw pas forcément : Stripe retentera le webhook si on renvoie 500
          // Ici on throw pour forcer le retry Stripe (recommandé)
          throw new Error(`Lovable update failed: ${r.status} ${text}`);
        } else {
          console.log("✅ Lovable status updated:", text);
        }
      }

      // 2) (Optionnel) Envoyer email confirmation de paiement
      const customerEmail = invoice.customer_email;
      const hostedInvoiceUrl = invoice.hosted_invoice_url;
      const amountPaid = (invoice.amount_paid / 100).toFixed(2);

      if (customerEmail) {
        await resend.emails.send({
          from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
          reply_to: "contact@parisunlockdoor.fr",
          to: [customerEmail, "contact@parisunlockdoor.fr"],
          subject: "Paiement confirmé — Serrurier Paris Express",
          html: `
            <h2>Paiement confirmé ✅</h2>
            <p>Merci pour votre règlement.</p>
            <p><strong>Montant payé :</strong> ${amountPaid} €</p>
            <p><a href="${hostedInvoiceUrl}">Voir la facture</a></p>
          `,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("❌ Webhook processing error:", e);
    // IMPORTANT : renvoyer 500 force Stripe à réessayer
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
