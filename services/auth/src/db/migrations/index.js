// Ordered migration registry — add new migrations in sequence here
const authSchema = require('./001-auth-schema');
const addRoles = require('./002-add-roles');
const invitesTable = require('./003-invites-table');
const userNames = require('./004-user-names');
const userPhone = require('./005-user-phone');
const loginAttempts = require('./006-login-attempts');
const passwordHistory = require('./007-password-history');
const nullablePassword = require('./008-nullable-password');

module.exports = [
  { name: '001-auth-schema', ...authSchema },
  { name: '002-add-roles', ...addRoles },
  { name: '003-invites-table', ...invitesTable },
  { name: '004-user-names', ...userNames },
  { name: '005-user-phone', ...userPhone },
  { name: '006-login-attempts', ...loginAttempts },
  { name: '007-password-history', ...passwordHistory },
  { name: '008-nullable-password', ...nullablePassword },
];
