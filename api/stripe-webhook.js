import Stripe from "stripe";

export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const LOVABLE_API_URL =
  process.env.LOVABLE_API_URL || "https://parisunlockdoor.lovable.app";

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

  // ✅ PAIEMENT CONFIRMÉ
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;

    const caseId = invoice.metadata?.caseId;
    const customerEmail = invoice.customer_email;
    const invoiceId = invoice.id;

    console.log("💰 invoice.paid received", {
      caseId,
      invoiceId,
      customerEmail,
    });

    if (!caseId) {
      console.error("⚠️ Missing caseId in metadata");
      return res.status(200).json({ received: true });
    }

    try {
      const response = await fetch(
        `${LOVABLE_API_URL}/api/payment-update`,
        {
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
        }
      );

      const text = await response.text();
      console.log("⬅️ Lovable response:", response.status, text);
    } catch (err) {
      console.error("❌ Webhook processing error:", err);
    }
  }

  res.json({ received: true });
}
