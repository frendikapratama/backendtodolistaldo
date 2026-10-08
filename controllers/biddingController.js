import Bidding from "../models/Bidding.js";
import mongoose from "mongoose";
import BOQItem from "../models/BOQItem.js";
import Party from "../models/Party.js";
import Project from "../models/Project.js";
import { handleError } from "../utils/errorHandler.js";

const populateBidding = (query) =>
  query
    .populate(
      "items.boqItem",
      "itemCode section description specification unit quantity",
    )
    .populate("items.quotations.supplier", "name email phone")
    .populate("items.selectedSupplier", "name email phone")
    .populate("suppliers", "name email phone");

export const listBiddings = async (req, res) => {
  try {
    const rows = await populateBidding(
      Bidding.find({ project: req.params.projectId }).sort({ createdAt: -1 }),
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error);
  }
};

export const getBidding = async (req, res) => {
  try {
    const bidding = await populateBidding(Bidding.findById(req.params.id));
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    res.json({ success: true, data: bidding });
  } catch (error) {
    handleError(res, error);
  }
};

export const createBidding = async (req, res) => {
  try {
    const { projectId, title, description = "" } = req.body;
    if (!title?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Nama pengadaan wajib diisi" });
    if (!mongoose.isValidObjectId(projectId))
      return res
        .status(400)
        .json({ success: false, message: "Project tidak valid" });
    const project = await Project.findById(projectId);
    if (!project)
      return res
        .status(400)
        .json({ success: false, message: "Project tidak ditemukan" });
    const bidding = await Bidding.create({
      project: projectId,
      title: title.trim(),
      description: description.trim(),
      status: "DRAFT",
      createdBy: req.user?._id,
    });
    res.status(201).json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateBiddingItems = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id);
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res.status(409).json({
        success: false,
        message: "Bidding sudah selesai dan terkunci",
      });
    const { boqItemIds = [] } = req.body;
    if (!Array.isArray(boqItemIds) || !boqItemIds.length)
      return res
        .status(400)
        .json({ success: false, message: "Pilih minimal satu item BOQ" });
    if (boqItemIds.some((id) => !mongoose.isValidObjectId(id)))
      return res
        .status(400)
        .json({ success: false, message: "Daftar item BOQ tidak valid" });
    if (new Set(boqItemIds.map(String)).size !== boqItemIds.length)
      return res
        .status(400)
        .json({ success: false, message: "Terdapat item BOQ yang duplikat" });
    const boqRows = await BOQItem.find({
      _id: { $in: boqItemIds },
      project: bidding.project,
    });
    if (boqRows.length !== new Set(boqItemIds.map(String)).size)
      return res.status(400).json({
        success: false,
        message: "Satu atau lebih item BOQ tidak ditemukan dalam project ini",
      });
    const activeDuplicate = await Bidding.findOne({
      _id: { $ne: bidding._id },
      project: bidding.project,
      status: { $ne: "FINISHED" },
      "items.boqItem": { $in: boqItemIds },
    }).select("title");
    if (activeDuplicate)
      return res.status(409).json({
        success: false,
        message: `Beberapa item BOQ sudah berada dalam pengadaan aktif "${activeDuplicate.title}".`,
      });
    const existingItems = new Map(
      bidding.items.map((item) => [String(item.boqItem), item]),
    );
    bidding.items = boqItemIds.map((boqId) => {
      const existing = existingItems.get(String(boqId));
      return (
        existing || {
          boqItem: boqId,
          quotations: [],
          selectedSupplier: null,
          selectionReason: "",
        }
      );
    });
    await bidding.save();
    res.json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateBiddingSuppliers = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id);
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res.status(409).json({
        success: false,
        message: "Bidding sudah selesai dan terkunci",
      });
    const { supplierIds = [] } = req.body;
    if (
      !Array.isArray(supplierIds) ||
      new Set(supplierIds.map(String)).size !== supplierIds.length ||
      supplierIds.some((id) => !mongoose.isValidObjectId(id))
    )
      return res.status(400).json({
        success: false,
        message: "Daftar supplier tidak valid atau duplikat",
      });
    if (supplierIds.length) {
      const parties = await Party.countDocuments({ _id: { $in: supplierIds } });
      if (parties !== supplierIds.length)
        return res.status(400).json({
          success: false,
          message: "Satu atau lebih supplier tidak ditemukan di Party Master",
        });
    }
    const removesQuotedSupplier = bidding.items.some((item) =>
      item.quotations.some(
        (q) => !supplierIds.some((id) => String(id) === String(q.supplier)),
      ),
    );
    if (removesQuotedSupplier)
      return res.status(409).json({
        success: false,
        message:
          "Supplier yang sudah memiliki quotation tidak dapat dikeluarkan dari pengadaan",
      });
    bidding.suppliers = supplierIds;
    if (bidding.status === "DRAFT" && supplierIds.length)
      bidding.status = "IN_PROGRESS";
    await bidding.save();
    res.json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateBiddingQuotations = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id);
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res.status(409).json({
        success: false,
        message: "Bidding sudah selesai dan terkunci",
      });
    if (!bidding.suppliers?.length)
      return res.status(400).json({
        success: false,
        message: "Pilih supplier peserta terlebih dahulu",
      });
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length)
      return res
        .status(400)
        .json({ success: false, message: "Data items tidak valid" });
    const participantIds = (bidding.suppliers || []).map(String);
    const existingItems = new Map(
      bidding.items.map((item) => [String(item.boqItem), item]),
    );
    for (const item of items) {
      const quoteSupplierIds = (item.quotations || []).map((q) =>
        String(q.supplier),
      );
      if (new Set(quoteSupplierIds).size !== quoteSupplierIds.length)
        return res.status(400).json({
          success: false,
          message: "Supplier hanya boleh memiliki satu quotation per item",
        });
      for (const q of item.quotations || []) {
        if (!participantIds.includes(String(q.supplier)))
          return res.status(400).json({
            success: false,
            message: "Quotation hanya untuk supplier peserta pengadaan",
          });
        if (!Number.isFinite(Number(q.unitPrice)) || Number(q.unitPrice) < 0)
          return res.status(400).json({
            success: false,
            message: "Harga satuan harus angka positif",
          });
      }
    }
    bidding.items = items.map(({ boqItem, quotations = [] }) => {
      const existing = existingItems.get(String(boqItem)) || {};
      return {
        boqItem,
        quotations: quotations.map((q) => ({
          supplier: q.supplier,
          unitPrice: Number(q.unitPrice),
          leadTime: q.leadTime || "",
          paymentTerm: q.paymentTerm || "",
          notes: q.notes || "",
          quotedAt: new Date(),
        })),
        selectedSupplier: existing.selectedSupplier || null,
        selectionReason: existing.selectionReason || "",
        selectedAt: existing.selectedAt || null,
        selectedBy: existing.selectedBy || null,
      };
    });
    if (bidding.status === "DRAFT" && bidding.items.length > 0)
      bidding.status = "IN_PROGRESS";
    await bidding.save();
    res.json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

// STEP 5-6 — PATCH /biddings/:id/selections
// Body: { items: [{ boqItem, selectedSupplier, selectionReason }] }
export const updateBiddingSelections = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id);
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res.status(409).json({
        success: false,
        message: "Bidding sudah selesai dan terkunci",
      });
    const { items } = req.body;
    if (!Array.isArray(items))
      return res
        .status(400)
        .json({ success: false, message: "Data items tidak valid" });
    const participantIds = new Set((bidding.suppliers || []).map(String));
    for (const sel of items) {
      if (!sel.selectedSupplier) continue;
      if (!participantIds.has(String(sel.selectedSupplier)))
        return res.status(400).json({
          success: false,
          message: "Supplier yang dipilih bukan peserta pengadaan",
        });
      const biddingItem = bidding.items.find(
        (i) => String(i.boqItem) === String(sel.boqItem),
      );
      if (!biddingItem)
        return res.status(400).json({
          success: false,
          message: "Item BOQ tidak ditemukan dalam pengadaan",
        });
      const hasQuotation = biddingItem.quotations.some(
        (q) => String(q.supplier) === String(sel.selectedSupplier),
      );
      if (!hasQuotation)
        return res.status(400).json({
          success: false,
          message:
            "Supplier yang dipilih belum memberikan quotation untuk item ini",
        });
    }
    const selectionMap = Object.fromEntries(
      items.map((s) => [String(s.boqItem), s]),
    );
    for (const item of bidding.items) {
      const sel = selectionMap[String(item.boqItem)];
      if (!sel) continue;
      if (sel.selectedSupplier !== undefined) {
        item.selectedSupplier = sel.selectedSupplier || null;
        item.selectedAt = sel.selectedSupplier ? new Date() : null;
        item.selectedBy = sel.selectedSupplier ? req.user?._id : null;
      }
      if (sel.selectionReason !== undefined)
        item.selectionReason = sel.selectionReason || "";
    }
    await bidding.save();
    res.json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateBidding = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id);
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res.status(409).json({
        success: false,
        message: "Bidding sudah selesai dan terkunci",
      });
    const { title, description } = req.body;
    if (title !== undefined) bidding.title = title.trim();
    if (description !== undefined) bidding.description = description.trim();
    await bidding.save();
    res.json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

export const finishBidding = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id).populate(
      "items.boqItem",
      "description quantity",
    );
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res
        .status(409)
        .json({ success: false, message: "Bidding sudah selesai" });
    if (!bidding.items.length)
      return res.status(400).json({
        success: false,
        message: "Bidding harus memiliki minimal 1 BOQ item",
      });
    if (!bidding.suppliers?.length)
      return res.status(400).json({
        success: false,
        message: "Bidding harus memiliki minimal 1 supplier",
      });
    const errors = [];
    for (const item of bidding.items) {
      const desc = item.boqItem?.description || String(item.boqItem);
      if (!item.quotations.length) {
        errors.push(`${desc}: belum memiliki quotation`);
        continue;
      }
      if (!item.selectedSupplier) {
        errors.push(`${desc}: supplier belum dipilih`);
        continue;
      }
      const hasQuotation = item.quotations.some(
        (q) => String(q.supplier) === String(item.selectedSupplier),
      );
      if (!hasQuotation)
        errors.push(`${desc}: supplier terpilih tidak memiliki quotation`);
    }
    if (errors.length)
      return res
        .status(400)
        .json({ success: false, message: errors.join(" | ") });
    bidding.status = "FINISHED";
    bidding.finishedAt = new Date();
    await bidding.save();
    res.json({
      success: true,
      data: await populateBidding(Bidding.findById(bidding._id)),
    });
  } catch (error) {
    handleError(res, error);
  }
};

// DELETE /biddings/:id
export const deleteBidding = async (req, res) => {
  try {
    const bidding = await Bidding.findById(req.params.id);
    if (!bidding)
      return res
        .status(404)
        .json({ success: false, message: "Bidding tidak ditemukan" });
    if (bidding.status === "FINISHED")
      return res.status(409).json({
        success: false,
        message: "Bidding yang sudah selesai tidak dapat dihapus",
      });
    await Bidding.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Bidding berhasil dihapus" });
  } catch (error) {
    handleError(res, error);
  }
};
