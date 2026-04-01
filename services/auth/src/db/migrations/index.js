// Ordered migration registry — add new migrations in sequence here
const authSchema = require('./001-auth-schema');

module.exports = [
  { name: '001-auth-schema', ...authSchema },
];
