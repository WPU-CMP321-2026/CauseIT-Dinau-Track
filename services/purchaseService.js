"use strict";

const { ValidationError } = require("sequelize");
const {
  FarmerNotFoundError,
  InvalidPurchaseError,
  PurchaseNotFoundError,
} = require("./errors");

// The Service Layer (Fowler): callers — a route handler, a CLI, a test —
// talk to ONE object that knows the business rules. They never touch
// Farmer/Purchase (the ORM models) or SQL directly.
class PurchaseService {
  constructor({ Farmer, Purchase }) {
    this.Farmer = Farmer;
    this.Purchase = Purchase;
  }

  // Compatibility helper: older Sequelize versions used `findById`,
  // newer versions use `findByPk`. Provide a single place to call.
  async _findFarmerByPk(id) {
    if (typeof this.Farmer.findByPk === "function") {
      return this.Farmer.findByPk(id);
    }
    if (typeof this.Farmer.findById === "function") {
      return this.Farmer.findById(id);
    }
    if (typeof this.Farmer.findOne === "function") {
      return this.Farmer.findOne({ where: { id } });
    }
    return null;
  }

  // ---- Create ----------------------------------------------------------
  async recordPurchase({ farmerId, weightKg, pricePerKg }) {
    const farmer = await this._findFarmerByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }

    try {
      return await this.Purchase.create({ farmerId, weightKg, pricePerKg });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new InvalidPurchaseError(error.errors.map((e) => e.message).join("; "));
      }
      throw error;
    }
  }

  // ---- Read --------------------------------------------------------------
  async getTotalOwed(farmerId) {
    const farmer = await this._findFarmerByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }

    const purchases = await this.Purchase.findAll({ where: { farmerId } });
    return Number(
      purchases.reduce((sum, p) => sum + p.weightKg * p.pricePerKg, 0).toFixed(2),
    );
  }

  async listPurchases(farmerId) {
    const farmer = await this._findFarmerByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }
    return this.Purchase.findAll({ where: { farmerId } });
  }

  // ---- Update --------------------------------------------------------------
  async correctPurchaseWeight(purchaseId, weightKg) {
    const purchase = await this.Purchase.findByPk(purchaseId);
    if (!purchase) {
      throw new PurchaseNotFoundError(purchaseId);
    }

    try {
      purchase.weightKg = weightKg;
      await purchase.save();
      return purchase;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new InvalidPurchaseError(error.errors.map((e) => e.message).join("; "));
      }
      throw error;
    }
  }

  // ---- Delete --------------------------------------------------------------
  async voidPurchase(purchaseId) {
    const purchase = await this.Purchase.findByPk(purchaseId);
    if (!purchase) {
      throw new PurchaseNotFoundError(purchaseId);
    }
    await purchase.destroy();
  }

  // ---- Read (new) ----------------------------------------------------------
  async getAveragePricePerKg(farmerId) {
    const farmer = await this._findFarmerByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }

    const purchases = await this.Purchase.findAll({ where: { farmerId } });
    if (purchases.length === 0) {
      return 0; // no purchases yet
    }

    const totalWeight = purchases.reduce((sum, p) => sum + p.weightKg, 0);
    const totalCost = purchases.reduce((sum, p) => sum + p.weightKg * p.pricePerKg, 0);

    return Number((totalCost / totalWeight).toFixed(2));
  }
}

module.exports = { PurchaseService };
