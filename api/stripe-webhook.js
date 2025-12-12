import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: {
    bodyParser: false,
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
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 🎯 Paiement confirmé
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;

    const customerEmail = invoice.customer_email;
    const hostedInvoiceUrl = invoice.hosted_invoice_url;
    const invoicePdf = invoice.invoice_pdf;

    try {
      // Email CLIENT
      await resend.emails.send({
        from: "Serrurier Paris Express <devis@ton-domaine.fr>",
        to: [customerEmail],
        subject: "Facture payée — Serrurier Paris Express",
        html: `
          <h2>Paiement confirmé ✅</h2>
          <p>Merci pour votre règlement.</p>
          <p>Vous trouverez votre facture en pièce jointe.</p>
          <p>
            <a href="${hostedInvoiceUrl}">Voir la facture en ligne</a>
          </p>
        `,
        attachments: [
          {
            path: invoicePdf,
            filename: "facture.pdf",
          },
        ],
      });

      // Email INTERNE
      await resend.emails.send({
        from: "Serrurier Paris Express <devis@ton-domaine.fr>",
        to: ["contact@ton-domaine.fr"],
        subject: "Facture payée — Client",
        html: `
          <h3>Facture payée</h3>
          <ul>
            <li>Email client : ${customerEmail}</li>
            <li>Montant TTC : ${(invoice.amount_paid / 100).toFixed(2)} €</li>
          </ul>
          <p>
            <a href="${hostedInvoiceUrl}">Voir facture Stripe</a>
          </p>
        `,
        attachments: [
          {
            path: invoicePdf,
            filename: "facture.pdf",
          },
        ],
      });

    } catch (e) {
      console.error("Erreur envoi email facture", e);
    }
  }

  res.json({ received: true });
}
