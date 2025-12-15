import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // mini “auth” simple côté API (à minima)
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${process.env.SERRURIER_ADMIN_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("cases")
    .select("id, created_at, customerName, customerPhone, address, status")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ data });
}
