export function getDatabaseErrorMessage(error) {
  const message = error instanceof Error ? error.message : "";
  const missingVariables = /^Missing server environment variables: (.+)$/.exec(message);
  if (missingVariables) {
    return `Vercel is missing these server environment variables: ${missingVariables[1]}. Add them in Project Settings → Environment Variables, then redeploy.`;
  }
  if (message === "DB_SSL_CA is required for verified TLS."
    || message === "DB_SSL_MODE must be REQUIRED, VERIFY_CA, VERIFY_IDENTITY, or DISABLED.") {
    return message;
  }

  switch (error?.code) {
    case "ER_ACCESS_DENIED_ERROR":
      return "Aiven rejected the database credentials. Check DB_USERNAME and DB_PASSWORD in Vercel.";
    case "ER_BAD_DB_ERROR":
      return "Aiven could not find the database named by DB_DATABASE. Check the Vercel setting.";
    case "ER_NO_SUCH_TABLE":
      return "The connected database is missing a required table. Apply liveness-server/schema.sql to the LewisSee database.";
    case "ENOTFOUND":
      return "The database host could not be resolved. Check DB_HOST in Vercel.";
    case "ETIMEDOUT":
    case "ECONNREFUSED":
      return "Vercel could not connect to Aiven. Check the Aiven service status and network access settings.";
    default:
      return `The database request failed${error?.code ? ` (${error.code})` : ""}. Check the Vercel DB_* settings and Aiven network access.`;
  }
}
