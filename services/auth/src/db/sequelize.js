const { Sequelize } = require('sequelize');

/**
 * Database connection with dual-mode authentication.
 *
 * - Local dev: uses DATABASE_URL with embedded password (e.g.
 *   postgresql://arcgen:pw@localhost:5432/arcgenerator_auth)
 *
 * - Production (Azure): uses Microsoft Entra token authentication.
 *   Set AZURE_CLIENT_ID to the client ID of the user-assigned managed
 *   identity attached to the Container App. The DATABASE_URL should
 *   contain the username (matching the registered Postgres role) and
 *   no password — the password is fetched at runtime as an Entra token.
 *
 * The mode is selected by checking AZURE_CLIENT_ID. If unset, password
 * auth is used as-is.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const useEntraAuth = !!process.env.AZURE_CLIENT_ID;

const sequelizeOptions = {
  dialect: 'postgres',
  logging: false,
  define: { underscored: true },
};

if (useEntraAuth) {
  // Lazy-require so local dev never has to install @azure/identity in
  // node_modules if it doesn't want to (it's still listed in deps for prod).
  const { ManagedIdentityCredential } = require('@azure/identity');

  const credential = new ManagedIdentityCredential({
    clientId: process.env.AZURE_CLIENT_ID,
  });

  // Cache the token between connection attempts. Tokens are valid ~24h.
  // The credential class handles refresh internally on .getToken() calls,
  // so we just call it before each new connection.
  let cachedToken = null;
  let cachedExpiresOn = 0;

  async function getDatabaseToken() {
    // Refresh 5 minutes before actual expiry to avoid mid-request failures
    const REFRESH_BUFFER_MS = 5 * 60 * 1000;
    if (cachedToken && Date.now() < cachedExpiresOn - REFRESH_BUFFER_MS) {
      return cachedToken;
    }
    const token = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
    if (!token) {
      throw new Error('Failed to acquire Entra access token for Postgres');
    }
    cachedToken = token.token;
    cachedExpiresOn = token.expiresOnTimestamp;
    return cachedToken;
  }

  // Sequelize calls this hook before opening a new pool connection.
  // We inject the fresh token as the password.
  sequelizeOptions.hooks = {
    beforeConnect: async (config) => {
      config.password = await getDatabaseToken();
    },
  };

  // SSL is required for Azure Postgres
  sequelizeOptions.dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  };
}

const sequelize = new Sequelize(databaseUrl, sequelizeOptions);

module.exports = sequelize;
