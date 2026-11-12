import { getPool } from "./_lib/database.js";
import { getDatabaseErrorMessage } from "./_lib/databaseErrorMessage.js";
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
      message: getDatabaseErrorMessage(error),
    });
  }
}
