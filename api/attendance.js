import { getPool } from "./_lib/database.js";
import { getDatabaseErrorMessage } from "./_lib/databaseErrorMessage.js";
import { loadAttendanceStore, replaceAttendanceStore } from "./_lib/attendanceStore.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
  maxDuration: 30,
};

export default async function handler(req, res) {
  try {
    const pool = getPool();
    if (req.method === "GET") {
      const store = await loadAttendanceStore(pool);
      return res.status(200).json(store);
    }
    if (req.method === "PUT") {
      const result = await replaceAttendanceStore(pool, req.body);
      return res.status(200).json(result);
    }
    return res.status(405).json({ detail: "Method not allowed." });
  } catch (error) {
    if (error?.statusCode === 422) {
      return res.status(422).json({ detail: error.message });
    }
    console.error("Vercel attendance API request failed:", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    return res.status(503).json({
      detail: getDatabaseErrorMessage(error),
      message: getDatabaseErrorMessage(error),
    });
  }
}
