// Ordered migration registry — add new migrations in sequence here
const authSchema = require('./001-auth-schema');
const addRoles = require('./002-add-roles');
const invitesTable = require('./003-invites-table');

module.exports = [
  { name: '001-auth-schema', ...authSchema },
  { name: '002-add-roles', ...addRoles },
  { name: '003-invites-table', ...invitesTable },
];
