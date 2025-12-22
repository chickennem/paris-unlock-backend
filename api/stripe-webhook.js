import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false, // ⚠️ OBLIGATOIRE pour Stripe
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// 🔧 utilitaire pour récupérer le RAW BODY
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
    const sig = req.headers["stripe-signature"];
    const buf = await buffer(req);

    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("✅ Stripe signature verified:", event.type);
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 🎯 Paiement confirmé
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_succeeded"
  ) {
    const invoice = event.data.object;

    const caseId = invoice.metadata?.caseId;
    const customerEmail = invoice.customer_email;
    const hostedInvoiceUrl = invoice.hosted_invoice_url;
    const invoicePdf = invoice.invoice_pdf;
    const amountTtc = (invoice.amount_paid / 100).toFixed(2);

    console.log("💰 Paiement reçu", {
      caseId,
      invoiceId: invoice.id,
      customerEmail,
    });

    if (!caseId || !customerEmail) {
      console.warn("⚠️ Missing caseId or customerEmail");
      return res.json({ received: true });
    }

    /* ----------------------------------------------------
       1️⃣ UPDATE STATUT → TERMINE (Lovable)
    ---------------------------------------------------- */
    try {
      await fetch(
        "https://parisunlockdoor.lovable.app/~api/payment-update",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`,
          },
          body: JSON.stringify({
            caseId,
            status: "TERMINE",
            invoiceId: invoice.id,
          }),
        }
      );

      console.log("✅ Statut mis à jour → TERMINE");
    } catch (err) {
      console.error("❌ Erreur update statut Lovable", err);
    }

    /* ----------------------------------------------------
       2️⃣ EMAIL CLIENT – Paiement confirmé
    ---------------------------------------------------- */
    try {
      await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        to: [customerEmail],
        subject: "Paiement confirmé – Serrurier Paris Express",
        html: `
          <h2>Paiement confirmé ✅</h2>
          <p>Merci pour votre règlement.</p>

          <p><strong>Dossier :</strong> ${caseId}</p>
          <p><strong>Montant payé :</strong> ${amountTtc} € TTC</p>

          <p>
            👉 <a href="${hostedInvoiceUrl}">Voir la facture en ligne</a>
          </p>

          <p>
            Serrurier Paris Express<br/>
            📞 06 49 65 85 10
          </p>
        `,
        attachments: invoicePdf
          ? [
              {
                filename: "facture.pdf",
                path: invoicePdf,
              },
            ]
          : [],
      });

      console.log("📧 Email client envoyé");
    } catch (err) {
      console.error("❌ Erreur email client", err);
    }

    /* ----------------------------------------------------
       3️⃣ EMAIL INTERNE
    ---------------------------------------------------- */
    try {
      await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        to: ["contact@parisunlockdoor.fr"],
        subject: `FACTURE PAYÉE – ${caseId}`,
        html: `
          <h3>Paiement confirmé</h3>
          <ul>
            <li>Dossier : ${caseId}</li>
            <li>Email client : ${customerEmail}</li>
            <li>Montant TTC : ${amountTtc} €</li>
          </ul>
          <p>
            <a href="${hostedInvoiceUrl}">Voir facture Stripe</a>
          </p>
        `,
      });

      console.log("📧 Email interne envoyé");
    } catch (err) {
      console.error("❌ Erreur email interne", err);
    }
  }

  return res.json({ received: true });
}
