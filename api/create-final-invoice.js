import Stripe from "stripe";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { caseId, customerName, customerEmail, items } = req.body;

    if (!customerEmail || !Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // ✅ Nettoyage des lignes
    const validItems = items
      .map((item) => {
        const raw = String(item.priceHt ?? "")
          .replace(",", ".")      // virgule → point
          .replace(/[^0-9.]/g, ""); // enlève €, espaces, etc.

        const price = Number(raw);

        if (!item.description || isNaN(price) || price <= 0) {
          return null;
        }

        return {
          description: item.description,
          priceHt: price,
        };
      })
      .filter(Boolean);

    if (validItems.length === 0) {
      return res.status(400).json({
        error: "Aucune ligne de facturation valide",
      });
    }

    // 1️⃣ Client Stripe
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName,
    });

    // 2️⃣ Lignes Stripe
    let totalHt = 0;

    for (const item of validItems) {
      const amount = Math.round(item.priceHt * 100);
      totalHt += item.priceHt;

      await stripe.invoiceItems.create({
        customer: customer.id,
        description: item.description,
        amount,
        currency: "eur",
      });
    }

    // 3️⃣ Facture Stripe
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 0,
      auto_advance: true,
      pending_invoice_items_behavior: "include",
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    const tva = totalHt * 0.2;
    const totalTtc = totalHt * 1.2;

    // 4️⃣ Email devis définitif
    await resend.emails.send({
      from: "Serrurier Paris Express <devis@mail.parisunlockdoor.fr>",
      to: [customerEmail],
      subject: `Devis définitif – Serrurier Paris Express (${caseId})`,
      html: `
        <h2>Votre devis définitif</h2>
        <p>Bonjour ${customerName},</p>

        <ul>
          ${validItems
            .map(
              (i) =>
                `<li>${i.description} — ${i.priceHt.toFixed(2)} € HT</li>`
            )
            .join("")}
        </ul>

        <p>
          <strong>Total HT :</strong> ${totalHt.toFixed(2)} €<br/>
          <strong>TVA (20%) :</strong> ${tva.toFixed(2)} €<br/>
          <strong>Total TTC :</strong> ${totalTtc.toFixed(2)} €
        </p>

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
    return res.status(500).json({ error: error.message });
  }
}
