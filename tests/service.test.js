"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildModels } = require("../models");
const { PurchaseService } = require("../services/purchaseService");
const {
  FarmerNotFoundError,
  InvalidPurchaseError,
  PurchaseNotFoundError,
} = require("../services/errors");

async function freshService() {
  const { sequelize, Farmer, Purchase } = buildModels();
  await sequelize.sync();
  return { sequelize, service: new PurchaseService({ Farmer, Purchase }), Farmer };
}

// Existing tests omitted for brevity...

test("getAveragePricePerKg returns correct average", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Test Farmer", village: "Village" });

  await service.recordPurchase({ farmerId: farmer.id, weightKg: 10, pricePerKg: 2 });
  await service.recordPurchase({ farmerId: farmer.id, weightKg: 20, pricePerKg: 3 });

  const avg = await service.getAveragePricePerKg(farmer.id);
  assert.equal(avg, 2.67); // (10*2 + 20*3) / 30 = 2.666... rounded

  await sequelize.close();
});

test("getAveragePricePerKg throws FarmerNotFoundError if farmer does not exist", async () => {
  const { sequelize, service } = await freshService();

  await assert.rejects(() => service.getAveragePricePerKg(9999), FarmerNotFoundError);

  await sequelize.close();
});

test("getAveragePricePerKg returns 0 if farmer exists but has no purchases", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Empty Farmer", village: "Village" });

  const avg = await service.getAveragePricePerKg(farmer.id);
  assert.equal(avg, 0);

  await sequelize.close();
});
