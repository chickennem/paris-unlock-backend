import { createClient } from "@supabase/supabase-js";

// 🔒 Client Supabase avec service role
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 🔓 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 🔐 Auth backend uniquement
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.PAYMENT_UPDATE_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { caseId, invoiceId } = req.body;

    if (!caseId || !invoiceId) {
      return res.status(400).json({ error: "Missing caseId or invoiceId" });
    }

    // 🔄 Update dossier
    const { error } = await supabase
      .from("cases")
      .update({
        status: "TERMINEE",
        invoice_id: invoiceId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("case_id", caseId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return res.status(500).json({ error: "DB update failed" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ payment-update error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
