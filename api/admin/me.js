import { dispatchApiRequest } from "../_lib/dispatch.js";

export default function handler(req, res) {
  return dispatchApiRequest(req, res, ["admin", "me"]);
}
