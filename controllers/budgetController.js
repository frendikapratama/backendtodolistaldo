import Budget from "../models/Budget.js";
import Cost from "../models/Cost.js";
import BOQItem from "../models/BOQItem.js";
import Project from "../models/Project.js";
import { handleError } from "../utils/errorHandler.js";

/**
 * Get budgets by project with pagination, server-side search, status filter, and summary calculations
 */
export const getBudgetsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    let {
      search = "",
      status = "all",
      section = "all",
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 25,
    } = req.query;

    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.max(1, parseInt(limit, 10) || 25);

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project tidak ditemukan",
      });
    }

    // Build base query
    const filter = { project: projectId };

    if (status && status !== "all") {
      filter.status = status;
    }

    // Query budgets with BOQItem populated
    let query = Budget.find(filter)
      .populate({
        path: "boqItem",
        select: "itemCode section description unit quantity unitPrice totalPrice status",
      })
      .populate({
        path: "createdBy",
        select: "username nama email photo",
      });

    // Fetch all matching filter for calculations and in-memory search on populated BOQ fields if needed
    let allBudgets = await query.exec();

    // Filter by section if specified
    if (section && section !== "all") {
      allBudgets = allBudgets.filter((b) => b.boqItem?.section === section);
    }

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      allBudgets = allBudgets.filter((b) => {
        const matchCode = b.budgetCode?.toLowerCase().includes(q);
        const matchBoqCode = b.boqItem?.itemCode?.toLowerCase().includes(q);
        const matchBoqDesc = b.boqItem?.description?.toLowerCase().includes(q);
        const matchNotes = b.notes?.toLowerCase().includes(q);
        return matchCode || matchBoqCode || matchBoqDesc || matchNotes;
      });
    }

    // Calculate actual costs for each budget from Approved Costs
    const budgetIds = allBudgets.map((b) => b._id);
    const approvedCosts = await Cost.aggregate([
      {
        $match: {
          budget: { $in: budgetIds },
          status: "Approved",
        },
      },
      {
        $group: {
          _id: "$budget",
          actualCost: { $sum: "$amount" },
          approvedCostCount: { $sum: 1 },
        },
      },
    ]);

    const actualCostMap = {};
    const costCountMap = {};
    approvedCosts.forEach((item) => {
      actualCostMap[item._id.toString()] = item.actualCost;
      costCountMap[item._id.toString()] = item.approvedCostCount;
    });

    // Map enriched budget objects
    const enrichedBudgets = allBudgets.map((b) => {
      const bObj = b.toObject();
      const actualCost = actualCostMap[b._id.toString()] || 0;
      const approvalBudget = bObj.approvedAmount || 0;
      const remainingBudget = approvalBudget - actualCost;
      const boqValue = bObj.boqItem?.totalPrice || 0;

      return {
        ...bObj,
        boqValue,
        actualCost,
        remainingBudget,
        approvedCostCount: costCountMap[b._id.toString()] || 0,
      };
    });

    // Sorting
    enrichedBudgets.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === "boqItem") {
        valA = a.boqItem?.description || "";
        valB = b.boqItem?.description || "";
      } else if (sortBy === "boqValue") {
        valA = a.boqValue || 0;
        valB = b.boqValue || 0;
      }

      if (typeof valA === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
    });

    // Overall Project Summary
    // Total BOQ Value of the project from BOQItems
    const allProjectBOQ = await BOQItem.find({ project: projectId }).select("totalPrice");
    const totalBOQValue = allProjectBOQ.reduce((acc, curr) => acc + (curr.totalPrice || 0), 0);

    // Sum of Planned & Approved Budgets
    const allProjectBudgets = await Budget.find({ project: projectId });
    const totalPlannedBudget = allProjectBudgets.reduce((acc, curr) => acc + (curr.plannedAmount || 0), 0);
    const totalApprovalBudget = allProjectBudgets.reduce((acc, curr) => acc + (curr.approvedAmount || 0), 0);

    // Total Actual Cost of the project (All Approved Costs)
    const totalProjectActualCosts = await Cost.aggregate([
      {
        $match: {
          project: project._id,
          status: "Approved",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);
    const totalActualCost = totalProjectActualCosts[0]?.total || 0;
    const totalRemainingBudget = totalApprovalBudget - totalActualCost;

    // Status counts
    const statusCounts = {
      Draft: 0,
      Submitted: 0,
      Approved: 0,
      Rejected: 0,
    };
    allProjectBudgets.forEach((b) => {
      if (statusCounts[b.status] !== undefined) {
        statusCounts[b.status]++;
      }
    });

    // Pagination slice
    const total = enrichedBudgets.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedItems = enrichedBudgets.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      summary: {
        totalBOQValue,
        totalPlannedBudget,
        totalApprovalBudget,
        totalActualCost,
        totalRemainingBudget,
        statusCounts,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Get single budget by ID with related costs breakdown
 */
export const getBudgetById = async (req, res) => {
  try {
    const { id } = req.params;
    const budget = await Budget.findById(id)
      .populate({
        path: "boqItem",
        select: "itemCode section description unit quantity unitPrice totalPrice status",
      })
      .populate({
        path: "createdBy",
        select: "username nama email photo",
      });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget tidak ditemukan",
      });
    }

    // Get all costs linked to this budget
    const costs = await Cost.find({ budget: id })
      .sort({ costDate: -1 })
      .populate({
        path: "createdBy",
        select: "username nama email",
      });

    const approvedCostSum = costs
      .filter((c) => c.status === "Approved")
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const bObj = budget.toObject();
    bObj.boqValue = bObj.boqItem?.totalPrice || 0;
    bObj.actualCost = approvedCostSum;
    bObj.remainingBudget = (bObj.approvedAmount || 0) - approvedCostSum;
    bObj.costs = costs;

    return res.status(200).json({
      success: true,
      data: bObj,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Create a new Budget for a BOQ Item
 */
export const createBudget = async (req, res) => {
  try {
    const {
      projectId,
      boqItemId,
      plannedAmount,
      notes = "",
      status = "Draft",
    } = req.body;

    if (!projectId || !boqItemId) {
      return res.status(400).json({
        success: false,
        message: "Project ID dan BOQ Item ID wajib diisi",
      });
    }

    const boqItem = await BOQItem.findById(boqItemId);
    if (!boqItem) {
      return res.status(404).json({
        success: false,
        message: "BOQ Item tidak ditemukan",
      });
    }

    // Check if budget for this BOQ Item already exists
    const existingBudget = await Budget.findOne({
      project: projectId,
      boqItem: boqItemId,
    });
    if (existingBudget) {
      return res.status(400).json({
        success: false,
        message: `Budget untuk BOQ Item "${boqItem.description}" sudah dibuat (${existingBudget.budgetCode}).`,
      });
    }

    // Generate unique budgetCode (e.g. BDG-001, BDG-002)
    const count = await Budget.countDocuments({ project: projectId });
    const budgetCode = `BDG-${String(count + 1).padStart(3, "0")}`;

    const newBudget = new Budget({
      project: projectId,
      boqItem: boqItemId,
      budgetCode,
      plannedAmount: Number(plannedAmount) || 0,
      approvedAmount: status === "Approved" ? Number(plannedAmount) || 0 : 0,
      notes,
      status: ["Draft", "Submitted"].includes(status) ? status : "Draft",
      createdBy: req.user?._id,
    });

    await newBudget.save();

    const populated = await Budget.findById(newBudget._id).populate("boqItem");

    return res.status(201).json({
      success: true,
      message: "Budget berhasil dibuat",
      data: populated,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Update budget
 */
export const updateBudget = async (req, res) => {
  try {
    const { id } = req.params;
    const { plannedAmount, notes } = req.body;

    const budget = await Budget.findById(id);
    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget tidak ditemukan",
      });
    }

    if (budget.status === "Approved") {
      return res.status(400).json({
        success: false,
        message: "Budget yang sudah Approved tidak dapat diedit secara langsung.",
      });
    }

    if (plannedAmount !== undefined) {
      budget.plannedAmount = Math.max(0, Number(plannedAmount) || 0);
    }
    if (notes !== undefined) {
      budget.notes = notes;
    }

    await budget.save();

    const updated = await Budget.findById(id).populate("boqItem");

    return res.status(200).json({
      success: true,
      message: "Budget berhasil diperbarui",
      data: updated,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Update budget approval status
 */
export const updateBudgetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedAmount, approvalNote } = req.body;

    if (!["Draft", "Submitted", "Approved", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status tidak valid",
      });
    }

    const budget = await Budget.findById(id);
    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget tidak ditemukan",
      });
    }

    budget.status = status;

    if (status === "Approved") {
      budget.approvedAmount =
        approvedAmount !== undefined
          ? Math.max(0, Number(approvedAmount) || 0)
          : budget.plannedAmount;
      if (approvalNote !== undefined) budget.approvalNote = approvalNote;
    } else if (status === "Rejected") {
      if (approvalNote !== undefined) budget.approvalNote = approvalNote;
    }

    await budget.save();

    return res.status(200).json({
      success: true,
      message: `Status budget berhasil diubah menjadi ${status}`,
      data: budget,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Delete budget
 */
export const deleteBudget = async (req, res) => {
  try {
    const { id } = req.params;

    const budget = await Budget.findById(id);
    if (!budget) {
      return res.status(404).json({
        success: false,
        message: "Budget tidak ditemukan",
      });
    }

    // Check if there are any approved costs
    const existingApprovedCost = await Cost.findOne({
      budget: id,
      status: "Approved",
    });

    if (existingApprovedCost) {
      return res.status(400).json({
        success: false,
        message: "Budget tidak dapat dihapus karena sudah memiliki Cost yang disetujui (Approved).",
      });
    }

    // Remove associated unapproved costs or prevent deletion
    await Cost.deleteMany({ budget: id });
    await Budget.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Budget berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
