"use strict";

const { DataTypes } = require("sequelize");

// Unchanged from Week 3 — see cmp321-week3-orm for the full class-to-table
// mapping walkthrough. This week builds ON TOP of the mapping, not instead
// of it.
function defineFarmer(sequelize) {
  return sequelize.define("Farmer", {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    village: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });
}

module.exports = { defineFarmer };
