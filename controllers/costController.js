import Cost from "../models/Cost.js";
import Budget from "../models/Budget.js";
import BOQItem from "../models/BOQItem.js";
import Project from "../models/Project.js";
import { handleError } from "../utils/errorHandler.js";

/**
 * Get costs by project with pagination, server-side search, status filter, and summary calculations
 */
export const getCostsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    let {
      search = "",
      status = "all",
      budgetId = "all",
      sortBy = "costDate",
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

    const filter = { project: projectId };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (budgetId && budgetId !== "all") {
      filter.budget = budgetId;
    }

    let allCosts = await Cost.find(filter)
      .populate({
        path: "boqItem",
        select: "itemCode section description unit quantity unitPrice totalPrice",
      })
      .populate({
        path: "budget",
        select: "budgetCode plannedAmount approvedAmount status",
      })
      .populate({
        path: "createdBy",
        select: "username nama email photo",
      })
      .exec();

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      allCosts = allCosts.filter((c) => {
        const matchCode = c.costCode?.toLowerCase().includes(q);
        const matchDesc = c.description?.toLowerCase().includes(q);
        const matchBudgetCode = c.budget?.budgetCode?.toLowerCase().includes(q);
        const matchBoqDesc = c.boqItem?.description?.toLowerCase().includes(q);
        return matchCode || matchDesc || matchBudgetCode || matchBoqDesc;
      });
    }

    // Sorting
    allCosts.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === "boqItem") {
        valA = a.boqItem?.description || "";
        valB = b.boqItem?.description || "";
      } else if (sortBy === "budgetCode") {
        valA = a.budget?.budgetCode || "";
        valB = b.budget?.budgetCode || "";
      } else if (sortBy === "costDate") {
        valA = new Date(a.costDate).getTime();
        valB = new Date(b.costDate).getTime();
      }

      if (typeof valA === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
    });

    // Summary calculations
    const allProjectCosts = await Cost.find({ project: projectId });
    let totalRealized = 0;
    let totalApproved = 0;
    let totalDraftOrSubmitted = 0;
    let totalRejected = 0;

    allProjectCosts.forEach((c) => {
      totalRealized += c.amount || 0;
      if (c.status === "Approved") {
        totalApproved += c.amount || 0;
      } else if (c.status === "Rejected") {
        totalRejected += c.amount || 0;
      } else {
        totalDraftOrSubmitted += c.amount || 0;
      }
    });

    const statusCounts = {
      Draft: 0,
      Submitted: 0,
      Approved: 0,
      Rejected: 0,
    };
    allProjectCosts.forEach((c) => {
      if (statusCounts[c.status] !== undefined) {
        statusCounts[c.status]++;
      }
    });

    // Pagination slice
    const total = allCosts.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedItems = allCosts.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      summary: {
        totalRealized,
        totalApproved,
        totalDraftOrSubmitted,
        totalRejected,
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
 * Get single cost by ID
 */
export const getCostById = async (req, res) => {
  try {
    const { id } = req.params;
    const cost = await Cost.findById(id)
      .populate("boqItem")
      .populate("budget")
      .populate({
        path: "createdBy",
        select: "username nama email",
      });

    if (!cost) {
      return res.status(404).json({
        success: false,
        message: "Cost tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: cost,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Create a new Cost entry based on BOQ Item and linked Budget
 */
export const createCost = async (req, res) => {
  try {
    const {
      projectId,
      boqItemId,
      costDate,
      description,
      amount,
      notes = "",
      status = "Draft",
    } = req.body;

    if (!projectId || !boqItemId || !costDate || !description || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Semua field wajib (Project, BOQ Item, Tanggal, Deskripsi, Amount) harus diisi",
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount harus lebih besar dari 0",
      });
    }

    // Find linked Budget for this boqItem
    const budget = await Budget.findOne({ project: projectId, boqItem: boqItemId });
    if (!budget) {
      return res.status(400).json({
        success: false,
        message: "Item BOQ ini belum memiliki Budget. Buat Budget terlebih dahulu sebelum mencatat Cost.",
      });
    }

    // Calculate current remaining budget
    const approvedCosts = await Cost.aggregate([
      {
        $match: {
          budget: budget._id,
          status: "Approved",
        },
      },
      {
        $group: {
          _id: "$budget",
          total: { $sum: "$amount" },
        },
      },
    ]);
    const actualCost = approvedCosts[0]?.total || 0;
    const approvalBudget = budget.approvedAmount || 0;
    const remainingBudget = approvalBudget - actualCost;

    let warning = null;
    if (numAmount > remainingBudget) {
      const overAmount = numAmount - remainingBudget;
      warning = `Perhatian: Cost melebihi Remaining Budget sebesar ${new Intl.NumberFormat(
        "id-ID",
        { style: "currency", currency: "IDR", maximumFractionDigits: 0 }
      ).format(overAmount)}.`;
    }

    // Generate unique costCode (e.g. CST-001)
    const count = await Cost.countDocuments({ project: projectId });
    const costCode = `CST-${String(count + 1).padStart(3, "0")}`;

    const newCost = new Cost({
      project: projectId,
      budget: budget._id,
      boqItem: boqItemId,
      costCode,
      costDate: new Date(costDate),
      description: description.trim(),
      amount: numAmount,
      notes,
      status: ["Draft", "Submitted"].includes(status) ? status : "Draft",
      createdBy: req.user?._id,
    });

    await newCost.save();

    const populated = await Cost.findById(newCost._id)
      .populate("boqItem")
      .populate("budget");

    return res.status(201).json({
      success: true,
      message: "Cost berhasil dicatat",
      warning,
      data: populated,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Update cost
 */
export const updateCost = async (req, res) => {
  try {
    const { id } = req.params;
    const { costDate, description, amount, notes } = req.body;

    const cost = await Cost.findById(id);
    if (!cost) {
      return res.status(404).json({
        success: false,
        message: "Cost tidak ditemukan",
      });
    }

    if (cost.status === "Approved") {
      return res.status(400).json({
        success: false,
        message: "Cost yang sudah Approved tidak dapat diedit secara langsung.",
      });
    }

    if (costDate) cost.costDate = new Date(costDate);
    if (description !== undefined) cost.description = description.trim();
    if (notes !== undefined) cost.notes = notes;
    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Amount harus lebih besar dari 0",
        });
      }
      cost.amount = numAmount;
    }

    await cost.save();

    const updated = await Cost.findById(id).populate("boqItem").populate("budget");

    return res.status(200).json({
      success: true,
      message: "Cost berhasil diperbarui",
      data: updated,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Update cost status (Approval Workflow)
 */
export const updateCostStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Draft", "Submitted", "Approved", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status tidak valid",
      });
    }

    const cost = await Cost.findById(id);
    if (!cost) {
      return res.status(404).json({
        success: false,
        message: "Cost tidak ditemukan",
      });
    }

    cost.status = status;
    await cost.save();

    return res.status(200).json({
      success: true,
      message: `Status cost berhasil diubah menjadi ${status}`,
      data: cost,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Delete cost
 */
export const deleteCost = async (req, res) => {
  try {
    const { id } = req.params;

    const cost = await Cost.findById(id);
    if (!cost) {
      return res.status(404).json({
        success: false,
        message: "Cost tidak ditemukan",
      });
    }

    if (cost.status === "Approved") {
      return res.status(400).json({
        success: false,
        message: "Cost dengan status Approved tidak boleh dihapus demi integritas audit biaya.",
      });
    }

    await Cost.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Cost berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
