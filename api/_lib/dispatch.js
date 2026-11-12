import catchAllHandler from "../[...path].js";

export function dispatchApiRequest(req, res, path) {
  const query = req.query && typeof req.query === "object" ? req.query : {};
  req.query = { ...query, path };
  return catchAllHandler(req, res);
}
