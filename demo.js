"use strict";

const { buildModels } = require("./models");
const { PurchaseService } = require("./services/purchaseService");
const { FarmerNotFoundError, InvalidPurchaseError } = require("./services/errors");

async function main() {
  const { sequelize, Farmer, Purchase } = buildModels();
  await sequelize.sync();

  const service = new PurchaseService({ Farmer, Purchase });

  const kessy = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });

  await service.recordPurchase({ farmerId: kessy.id, weightKg: 42.5, pricePerKg: 8.5 });
  await service.recordPurchase({ farmerId: kessy.id, weightKg: 30, pricePerKg: 9.0 });

  console.log(`Total owed: PGK ${await service.getTotalOwed(kessy.id)}`);

  // Two deliberate failures, handled explicitly rather than crashing the
  // process — this is the "Exception Handling" half of the week's content.
  try {
    await service.recordPurchase({ farmerId: 9999, weightKg: 10, pricePerKg: 8 });
  } catch (error) {
    if (error instanceof FarmerNotFoundError) {
      console.log(`Handled: ${error.message}`);
    } else {
      throw error;
    }
  }

  try {
    await service.recordPurchase({ farmerId: kessy.id, weightKg: -5, pricePerKg: 8 });
  } catch (error) {
    if (error instanceof InvalidPurchaseError) {
      console.log(`Handled: ${error.message}`);
    } else {
      throw error;
    }
  }

  await sequelize.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
