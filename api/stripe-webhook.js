import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
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

  try {
    // ✅ Paiement confirmé
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      const caseId = invoice.metadata?.caseId;

      if (!caseId) {
        console.error("❌ Missing caseId in invoice metadata");
        return res.status(200).json({ received: true });
      }

      console.log("✅ invoice.paid received", {
        caseId,
        invoiceId: invoice.id,
        eventId: event.id,
      });

      // 🔥 Appel Lovable pour update le statut
      const response = await fetch(
        "https://parisunlockdoor.lovable.app/api/payment-update",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`,
          },
          body: JSON.stringify({
            caseId,
            invoiceId: invoice.id,
            eventId: event.id,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error("❌ Lovable error:", text);
      } else {
        console.log("✅ Lovable status updated");
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
