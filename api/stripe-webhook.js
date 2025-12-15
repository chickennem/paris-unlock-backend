import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false, // 🔥 OBLIGATOIRE
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Lire le body brut EXACT
 */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = Buffer.from([]);
    req.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ EVENT VALIDE À 100 %
  try {
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const caseId = invoice.metadata?.caseId;

      console.log("✅ invoice.paid verified", {
        caseId,
        invoiceId: invoice.id,
      });

      if (caseId) {
        await fetch("https://parisunlockdoor.lovable.app/api/payment-update", {
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
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
