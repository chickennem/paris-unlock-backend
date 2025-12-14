import Stripe from "stripe";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const TVA_RATE = 0.20;

export default async function handler(req, res) {
  // 🔓 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { caseId, customerName, customerEmail, items } = req.body;

    if (!customerEmail || !Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // 🔒 Nettoyage & validation lignes
    const validItems = items
      .map((item) => {
        const raw = String(item.priceHt ?? "")
          .replace(",", ".")
          .replace(/[^0-9.]/g, "");

        const priceHt = Number(raw);

        if (!item.description || isNaN(priceHt) || priceHt <= 0) {
          return null;
        }

        return {
          description: item.description,
          priceHt,
        };
      })
      .filter(Boolean);

    if (validItems.length === 0) {
      return res.status(400).json({
        error: "Aucune ligne valide",
      });
    }

    // 🧮 Calculs
    const totalHt = validItems.reduce((sum, i) => sum + i.priceHt, 0);
    const tva = totalHt * TVA_RATE;
    const totalTtc = totalHt + tva;

    // 1️⃣ Client Stripe
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName,
    });

    // 2️⃣ UNE ligne Stripe = TOTAL TTC
    await stripe.invoiceItems.create({
      customer: customer.id,
      description: `Intervention serrurerie – Dossier ${caseId}`,
      amount: Math.round(totalTtc * 100), // ✅ TTC
      currency: "eur",
    });

    // 3️⃣ Facture Stripe
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 0,
      auto_advance: true,
      pending_invoice_items_behavior: "include",
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // 4️⃣ Email devis définitif
    await resend.emails.send({
      from: "Serrurier Paris Express <contact@parisunlockdoor.fr>",
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
          Payer en ligne (${totalTtc.toFixed(2)} € TTC)
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
      totalTtc: totalTtc.toFixed(2),
    });
  } catch (error) {
    console.error("create-final-invoice error:", error);
    return res.status(500).json({ error: error.message });
  }
}
