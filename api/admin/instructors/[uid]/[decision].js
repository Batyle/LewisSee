import { dispatchApiRequest } from "../../../_lib/dispatch.js";

export default function handler(req, res) {
  const uid = req.query?.uid;
  const decision = req.query?.decision;
  if (typeof uid !== "string" || typeof decision !== "string") {
    return res.status(400).json({ message: "Invalid instructor action path." });
  }
  return dispatchApiRequest(req, res, ["admin", "instructors", uid, decision]);
}
