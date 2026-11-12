import { getPool } from "./_lib/database.js";
import { listBlocks } from "./_lib/blocks.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  try {
    const blocks = await listBlocks(getPool());
    return res.status(200).json({ blocks });
  } catch (error) {
    console.error("Vercel blocks API request failed:", error.code || error.name);
    return res.status(503).json({
      message: "Could not read the live database. Check the Vercel DB_* environment variables and Aiven network access.",
    });
  }
}
