import Stripe from "stripe";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 🔓 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { caseId, customerName, customerEmail } = req.body;

    if (!caseId || !customerEmail) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    // 1️⃣ Client Stripe
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName || "Client",
    });

    // 2️⃣ Ligne facture 69 €
    await stripe.invoiceItems.create({
      customer: customer.id,
      amount: 6900, // 69 € TTC
      currency: "eur",
      description: "Frais de déplacement – intervention annulée",
    });

    // 3️⃣ Facture
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 0,
      auto_advance: true,
      pending_invoice_items_behavior: "include",
      metadata: {
        case_id: caseId,
        type: "CANCELLATION_FEE",
      },
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // 4️⃣ EMAIL CLIENT + INTERNE (OBLIGATOIRE)
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
      reply_to: "contact@parisunlockdoor.fr",
      to: [customerEmail, "contact@parisunlockdoor.fr"],
      subject: `Annulation – Frais de déplacement (69 €) – ${caseId}`,
      html: `
        <h2>Annulation de l’intervention</h2>

        <p>
          Suite à l’annulation de votre intervention après déplacement,
          des frais de déplacement de <strong>69 €</strong> sont applicables.
        </p>

        <p>
          👉 <a href="${finalizedInvoice.hosted_invoice_url}">
          Régler les frais de déplacement (69 €)
          </a>
        </p>

        <p>
          Serrurier Paris Express<br/>
          📞 06 49 65 85 10
        </p>
      `,
    });

    return res.status(200).json({
      success: true,
      paymentUrl: finalizedInvoice.hosted_invoice_url,
    });
  } catch (error) {
    console.error("create-cancellation-invoice error:", error);
    return res.status(500).json({ error: error.message });
  }
}
