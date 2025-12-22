import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false, // OBLIGATOIRE pour Stripe
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Utilitaire pour lire le body brut (Stripe signature)
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

  // =========================================================
  // 🎯 FACTURE PAYÉE (EVENT FIABLE AVEC send_invoice)
  // =========================================================
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;

    const caseId = invoice.metadata?.caseId;
    const invoiceId = invoice.id;
    const customerEmail = invoice.customer_email;
    const hostedInvoiceUrl = invoice.hosted_invoice_url;
    const invoicePdf = invoice.invoice_pdf;

    console.log("💰 invoice.payment_succeeded received", {
      caseId,
      invoiceId,
      customerEmail,
    });

    if (!caseId) {
      console.warn("⚠️ Missing caseId in invoice metadata");
      return res.json({ received: true });
    }

    // =====================================================
    // 🔁 UPDATE STATUT DANS LOVABLE (API BACKEND)
    // =====================================================
    try {
      const lovableUrl = `${process.env.LOVABLE_API_URL}/~api/payment-update`;

      const response = await fetch(lovableUrl, {
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

      const text = await response.text();
      console.log("🔁 Lovable response:", response.status, text);

      if (!response.ok || text.includes("<!doctype html>")) {
        console.error("❌ Lovable API error or wrong endpoint");
      }
    } catch (err) {
      console.error("❌ Error calling Lovable payment-update:", err);
    }

    // =====================================================
    // 📧 EMAIL CLIENT — PAIEMENT CONFIRMÉ
    // =====================================================
    try {
      await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        to: [customerEmail],
        subject: `Paiement confirmé – Serrurier Paris Express (${caseId})`,
        html: `
          <h2>Paiement confirmé ✅</h2>

          <p>
            Nous confirmons la réception de votre paiement
            pour le dossier <strong>${caseId}</strong>.
          </p>

          <p>
            👉 <a href="${hostedInvoiceUrl}">Voir la facture en ligne</a><br/>
            👉 <a href="${invoicePdf}">Télécharger la facture (PDF)</a>
          </p>

          <p>
            Serrurier Paris Express<br/>
            📞 06 49 65 85 10
          </p>
        `,
      });

      console.log("📧 Email paiement confirmé envoyé au client");
    } catch (err) {
      console.error("❌ Error sending client email:", err);
    }

    // =====================================================
    // 📧 EMAIL INTERNE
    // =====================================================
    try {
      await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        to: ["contact@parisunlockdoor.fr"],
        subject: `PAIEMENT CONFIRMÉ – ${caseId}`,
        html: `
          <h3>Paiement confirmé</h3>
          <ul>
            <li>Dossier : ${caseId}</li>
            <li>Email client : ${customerEmail}</li>
            <li>
              Facture :
              <a href="${hostedInvoiceUrl}">Lien Stripe</a>
            </li>
          </ul>
        `,
      });

      console.log("📧 Email interne paiement confirmé envoyé");
    } catch (err) {
      console.error("❌ Error sending internal email:", err);
    }
  }

  // Toujours répondre 200 à Stripe
  res.json({ received: true });
}
