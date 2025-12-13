import Stripe from "stripe";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    caseId,
    customerEmail,
    customerName,
    description,
    priceHt
  } = req.body;

  try {
    // 1️⃣ Créer ou récupérer le client Stripe
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName,
    });

    // 2️⃣ Créer la facture Stripe
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customer.id,
      description,
      amount: Math.round(priceHt * 100),
      currency: "eur",
    });

    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 0,
      auto_advance: true,
    });

    // 3️⃣ Finaliser la facture
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // 4️⃣ Envoyer le devis définitif par email
    await resend.emails.send({
      from: "Serrurier Paris Express <devis@mail.parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Devis définitif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Votre devis définitif</h2>
        <p>Bonjour ${customerName},</p>
        <p>Suite à l’intervention, voici le devis définitif :</p>
        <ul>
          <li>Description : ${description}</li>
          <li>Prix HT : ${priceHt} €</li>
          <li>TVA (20%) : ${(priceHt * 0.2).toFixed(2)} €</li>
          <li><strong>Total TTC : ${(priceHt * 1.2).toFixed(2)} €</strong></li>
        </ul>
        <p>
          👉 <a href="${finalizedInvoice.hosted_invoice_url}">
          Payer en ligne en toute sécurité
          </a>
        </p>
      `,
    });

    return res.status(200).json({
      success: true,
      paymentUrl: finalizedInvoice.hosted_invoice_url,
    });
  } catch (error) {
    console.error("Erreur création facture:", error);
    return res.status(500).json({ error: "Invoice creation failed" });
  }
}
