import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Buffer pour Stripe
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
    console.error("❌ Stripe signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ FACTURE PAYÉE
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;

    const customerEmail = invoice.customer_email;
    const hostedInvoiceUrl = invoice.hosted_invoice_url;
    const invoicePdfUrl = invoice.invoice_pdf;
    const amountPaid = (invoice.amount_paid / 100).toFixed(2);

    try {
      // 📧 EMAIL CLIENT
      await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        to: [customerEmail],
        subject: "Paiement confirmé — Serrurier Paris Express",
        html: `
          <h2>Paiement confirmé ✅</h2>

          <p>Merci pour votre règlement.</p>

          <p>
            <strong>Montant payé :</strong> ${amountPaid} € TTC
          </p>

          <p>
            👉 <a href="${hostedInvoiceUrl}">
              Voir votre facture en ligne
            </a>
          </p>

          <p>
            Serrurier Paris Express<br/>
            📞 06 49 65 85 10
          </p>
        `,
      });

      // 📧 EMAIL INTERNE
      await resend.emails.send({
        from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
        to: ["contact@parisunlockdoor.fr"],
        subject: "Facture payée — Client",
        html: `
          <h3>Facture payée</h3>

          <ul>
            <li>Email client : ${customerEmail}</li>
            <li>Montant TTC : ${amountPaid} €</li>
          </ul>

          <p>
            <a href="${hostedInvoiceUrl}">
              Voir la facture Stripe
            </a>
          </p>

          <p>
            PDF :
            <a href="${invoicePdfUrl}">
              Télécharger la facture
            </a>
          </p>
        `,
      });

    } catch (error) {
      console.error("❌ Erreur envoi email facture :", error);
    }
  }

  // Stripe exige une réponse 200
  return res.status(200).json({ received: true });
}
