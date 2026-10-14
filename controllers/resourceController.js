import mongoose from "mongoose";
import Resource from "../models/Resource.js";
import ResourcePlanning from "../models/ResourcePlanning.js";
import Project from "../models/Project.js";
import BOQItem from "../models/BOQItem.js";
import { handleError } from "../utils/errorHandler.js";

const CATEGORIES = ["Material", "Manpower", "Equipment"];
const PLANNING_STATUSES = ["Planned", "Confirmed", "Cancelled"];
const sendError = (res, status, message) => res.status(status).json({ success: false, message });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listResources = async (req, res) => {
  try {
    const { search = "", category = "all", status = "all" } = req.query;
    const filter = {};
    if (category !== "all" && CATEGORIES.includes(category)) filter.category = category;
    if (status !== "all" && ["Active", "Inactive"].includes(status)) filter.status = status;
    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { code: regex }, { category: regex }, { description: regex }];
    }
    const resources = await Resource.find(filter).sort({ updatedAt: -1, name: 1 }).lean();
    return res.json({ success: true, data: resources });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getResource = async (req, res) => {
  try {
    if (!validId(req.params.id)) return sendError(res, 400, "ID resource tidak valid");
    const resource = await Resource.findById(req.params.id).lean();
    if (!resource) return sendError(res, 404, "Resource tidak ditemukan");
    return res.json({ success: true, data: resource });
  } catch (error) { return handleError(res, error); }
};

export const createResource = async (req, res) => {
  try {
    const { name, code, category, unit, description, estimatedPrice, brand, technicalSpecs, status } = req.body;
    if (!name?.trim() || !code?.trim() || !unit?.trim()) return sendError(res, 400, "Nama, kode, dan unit wajib diisi");
    if (!CATEGORIES.includes(category)) return sendError(res, 400, "Kategori resource tidak valid");
    const resource = await Resource.create({ name, code, category, unit, description, estimatedPrice, brand, technicalSpecs, status, createdBy: req.user._id });
    return res.status(201).json({ success: true, message: "Resource berhasil dibuat", data: resource });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "Kode resource sudah digunakan");
    return handleError(res, error);
  }
};

export const updateResource = async (req, res) => {
  try {
    if (!validId(req.params.id)) return sendError(res, 400, "ID resource tidak valid");
    if (req.body.category && !CATEGORIES.includes(req.body.category)) return sendError(res, 400, "Kategori resource tidak valid");
    if (req.body.status && !["Active", "Inactive"].includes(req.body.status)) return sendError(res, 400, "Status resource tidak valid");
    const allowedFields = ["name", "code", "category", "unit", "description", "estimatedPrice", "brand", "technicalSpecs", "status"];
    const updates = Object.fromEntries(allowedFields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, req.body[field]]));
    const resource = await Resource.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!resource) return sendError(res, 404, "Resource tidak ditemukan");
    return res.json({ success: true, message: "Resource berhasil diperbarui", data: resource });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "Kode resource sudah digunakan");
    return handleError(res, error);
  }
};

export const deleteResource = async (req, res) => {
  try {
    if (!validId(req.params.id)) return sendError(res, 400, "ID resource tidak valid");
    const resource = await Resource.findById(req.params.id);
    if (!resource) return sendError(res, 404, "Resource tidak ditemukan");
    const usageCount = await ResourcePlanning.countDocuments({ resource: resource._id });
    if (usageCount) return sendError(res, 409, "Resource sudah digunakan dalam perencanaan. Ubah status menjadi Inactive.");
    await resource.deleteOne();
    return res.json({ success: true, message: "Resource berhasil dihapus" });
  } catch (error) { return handleError(res, error); }
};

const validatePlanningPayload = async (projectId, payload, currentResourceId = null) => {
  if (!validId(payload.resource)) return { error: "Pilih resource yang valid" };
  const resource = await Resource.findById(payload.resource);
  if (!resource) return { error: "Resource tidak ditemukan" };
  if (resource.status !== "Active" && resource._id.toString() !== currentResourceId) return { error: "Resource tidak aktif dan tidak dapat direncanakan" };
  const quantity = Number(payload.plannedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Kuantitas rencana harus lebih besar dari 0" };
  if (payload.boqItem) {
    if (!validId(payload.boqItem)) return { error: "Item BOQ tidak valid" };
    const boqItem = await BOQItem.findOne({ _id: payload.boqItem, project: projectId });
    if (!boqItem) return { error: "Item BOQ tidak ditemukan pada proyek ini" };
  }
  if (payload.status && !PLANNING_STATUSES.includes(payload.status)) return { error: "Status perencanaan tidak valid" };
  const start = payload.plannedStartDate ? new Date(payload.plannedStartDate) : null;
  const end = payload.plannedEndDate ? new Date(payload.plannedEndDate) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return { error: "Tanggal penggunaan tidak valid" };
  if (start && end && end < start) return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai" };
  return { resource, quantity, start, end };
};

export const listProjectResourcePlanning = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = req.project || await Project.findById(projectId);
    if (!project) return sendError(res, 404, "Project tidak ditemukan");
    const plans = await ResourcePlanning.find({ project: projectId })
      .populate("resource")
      .populate("boqItem", "itemCode section description unit quantity")
      .sort({ updatedAt: -1 })
      .lean();
    const summary = { Material: 0, Manpower: 0, Equipment: 0 };
    plans.forEach((plan) => {
      if (plan.status !== "Cancelled" && summary[plan.resource?.category] !== undefined) {
        summary[plan.resource.category] += 1;
      }
    });
    return res.json({ success: true, data: plans, summary });
  } catch (error) { return handleError(res, error); }
};

export const createResourcePlanning = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = req.project || await Project.findById(projectId);
    if (!project) return sendError(res, 404, "Project tidak ditemukan");
    const validated = await validatePlanningPayload(projectId, req.body);
    if (validated.error) return sendError(res, 400, validated.error);
    const plan = await ResourcePlanning.create({
      project: projectId,
      resource: validated.resource._id,
      boqItem: req.body.boqItem || null,
      plannedQuantity: validated.quantity,
      unit: validated.resource.unit,
      plannedStartDate: validated.start,
      plannedEndDate: validated.end,
      notes: req.body.notes || "",
      status: req.body.status || "Planned",
      createdBy: req.user._id,
    });
    await plan.populate(["resource", { path: "boqItem", select: "itemCode section description unit quantity" }]);
    return res.status(201).json({ success: true, message: "Perencanaan resource berhasil dibuat", data: plan });
  } catch (error) { return handleError(res, error); }
};

export const updateResourcePlanning = async (req, res) => {
  try {
    const plan = await ResourcePlanning.findOne({ _id: req.params.planId, project: req.params.projectId });
    if (!plan) return sendError(res, 404, "Perencanaan resource tidak ditemukan");
    const payload = { ...plan.toObject(), ...req.body, resource: req.body.resource || plan.resource.toString() };
    const validated = await validatePlanningPayload(req.params.projectId, payload, plan.resource.toString());
    if (validated.error) return sendError(res, 400, validated.error);
    plan.resource = validated.resource._id;
    plan.boqItem = payload.boqItem || null;
    plan.plannedQuantity = validated.quantity;
    plan.unit = validated.resource.unit;
    plan.plannedStartDate = validated.start;
    plan.plannedEndDate = validated.end;
    plan.notes = payload.notes || "";
    plan.status = payload.status || "Planned";
    await plan.save();
    await plan.populate(["resource", { path: "boqItem", select: "itemCode section description unit quantity" }]);
    return res.json({ success: true, message: "Perencanaan resource berhasil diperbarui", data: plan });
  } catch (error) { return handleError(res, error); }
};

export const deleteResourcePlanning = async (req, res) => {
  try {
    const plan = await ResourcePlanning.findOneAndDelete({ _id: req.params.planId, project: req.params.projectId });
    if (!plan) return sendError(res, 404, "Perencanaan resource tidak ditemukan");
    return res.json({ success: true, message: "Perencanaan resource berhasil dihapus" });
  } catch (error) { return handleError(res, error); }
};
