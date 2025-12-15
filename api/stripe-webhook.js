import Stripe from "stripe";
import { Resend } from "resend";

export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

/* ─────────────────────────────
   Utils
───────────────────────────── */

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function postWithRetry(url, options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      console.error(
        `❌ Fetch attempt ${attempt + 1} failed:`,
        err?.message || err
      );
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 700)); // backoff
    }
  }
}

/* ─────────────────────────────
   Handler
───────────────────────────── */

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

  try {
    /* ─────────────────────────────
       Paiement confirmé (Invoice)
    ───────────────────────────── */

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      const caseId = invoice?.metadata?.case_id;
      const invoiceId = invoice?.id;
      const eventId = event?.id;

      console.log("✅ invoice.paid received", {
        caseId,
        invoiceId,
        eventId,
      });

      /* ─────────────────────────────
         1️⃣ Update statut dans Lovable
      ───────────────────────────── */

      if (caseId) {
        const baseUrl = process.env.LOVABLE_BASE_URL;
        if (!baseUrl) {
          throw new Error("LOVABLE_BASE_URL is not defined");
        }

        const endpoint = `${baseUrl.replace(/\/$/, "")}/api/payment-update`;
        console.log("➡️ Calling Lovable:", endpoint);

        const response = await postWithRetry(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": process.env.PAYMENT_UPDATE_SECRET,
          },
          body: JSON.stringify({
            caseId,
            stripeInvoiceId: invoiceId,
            stripeEventId: eventId,
          }),
        });

        const responseText = await response.text();
        console.log("⬅️ Lovable response:", response.status, responseText);

        if (!response.ok) {
          throw new Error(
            `Lovable update failed: ${response.status} ${responseText}`
          );
        }
      } else {
        console.warn(
          "⚠️ invoice.paid received WITHOUT metadata.case_id",
          invoiceId
        );
      }

      /* ─────────────────────────────
         2️⃣ Email confirmation paiement
      ───────────────────────────── */

      const customerEmail = invoice.customer_email;
      const amountPaid = (invoice.amount_paid / 100).toFixed(2);
      const hostedInvoiceUrl = invoice.hosted_invoice_url;

      if (customerEmail) {
        await resend.emails.send({
          from: "Serrurier Paris Express <contact@mail.parisunlockdoor.fr>",
          reply_to: "contact@parisunlockdoor.fr",
          to: [customerEmail, "contact@parisunlockdoor.fr"],
          subject: "Paiement confirmé — Serrurier Paris Express",
          html: `
            <h2>Paiement confirmé ✅</h2>
            <p>Merci pour votre règlement.</p>
            <p><strong>Montant payé :</strong> ${amountPaid} €</p>
            <p>
              <a href="${hostedInvoiceUrl}">
                Voir la facture
              </a>
            </p>
            <p>
              Serrurier Paris Express<br/>
              📞 06 49 65 85 10
            </p>
          `,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    // IMPORTANT : renvoyer 500 pour forcer Stripe à retry
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
