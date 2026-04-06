const { DataTypes } = require('sequelize');

async function up(queryInterface) {
  await queryInterface.addColumn('users', 'first_name', {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  await queryInterface.addColumn('users', 'last_name', {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
}

async function down(queryInterface) {
  await queryInterface.removeColumn('users', 'last_name');
  await queryInterface.removeColumn('users', 'first_name');
}

module.exports = { up, down };
