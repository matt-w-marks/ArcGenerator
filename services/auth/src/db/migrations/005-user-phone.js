const { DataTypes } = require('sequelize');

async function up(queryInterface) {
  await queryInterface.addColumn('users', 'phone', {
    type: DataTypes.STRING(32),
    allowNull: true,
  });
}

async function down(queryInterface) {
  await queryInterface.removeColumn('users', 'phone');
}

module.exports = { up, down };
