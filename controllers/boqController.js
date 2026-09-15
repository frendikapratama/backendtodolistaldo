import BOQItem from "../models/BOQItem.js";
import Project from "../models/Project.js";
import { handleError } from "../utils/errorHandler.js";

/**
 * Get distinct sections for a project (reusable dropdown)
 */
export const getBOQSections = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sections = await BOQItem.distinct("section", { project: projectId });
    return res.status(200).json({
      success: true,
      data: sections.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Get BOQ items with backend pagination, search, filter, sorting, section grouping, and totals
 */
export const getBOQByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    let {
      search = "",
      section = "all",
      status = "all",
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

    // Build filter query
    const filter = { project: projectId };

    if (section && section !== "all") {
      filter.section = section;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { itemCode: searchRegex },
        { description: searchRegex },
        { section: searchRegex },
        { notes: searchRegex },
      ];
    }

    // Determine sort options
    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "itemCode",
      "section",
      "description",
      "quantity",
      "unitPrice",
      "totalPrice",
      "status",
    ];

    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const sort = { [sortField]: sortDir };

    // Total filtered records
    const totalFiltered = await BOQItem.countDocuments(filter);
    const totalPages = Math.ceil(totalFiltered / limit) || 1;
    const skip = (page - 1) * limit;

    // Fetch paginated items
    const items = await BOQItem.find(filter)
      .populate("createdBy", "username email avatar")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Group items by Section and calculate section subtotals for the current paginated view
    const sectionMap = {};
    items.forEach((item) => {
      const secName = item.section || "Tanpa Kategori";
      if (!sectionMap[secName]) {
        sectionMap[secName] = {
          name: secName,
          items: [],
          subtotal: 0,
          itemCount: 0,
        };
      }
      sectionMap[secName].items.push(item);
      sectionMap[secName].subtotal += item.totalPrice || 0;
      sectionMap[secName].itemCount += 1;
    });

    // Calculate Grand Total across all project items (or filtered items)
    const grandTotalAgg = await BOQItem.aggregate([
      { $match: { project: project._id } },
      { $group: { _id: null, grandTotal: { $sum: "$totalPrice" }, totalCount: { $sum: 1 } } },
    ]);

    const overallGrandTotal = grandTotalAgg[0]?.grandTotal || 0;
    const overallTotalCount = grandTotalAgg[0]?.totalCount || 0;

    // Filtered grand total
    const filteredGrandTotalAgg = await BOQItem.aggregate([
      { $match: filter },
      { $group: { _id: null, grandTotal: { $sum: "$totalPrice" } } },
    ]);
    const filteredGrandTotal = filteredGrandTotalAgg[0]?.grandTotal || 0;

    // Status counts across the whole project
    const allProjectItems = await BOQItem.find({ project: projectId }).select("status");
    const statusCounts = {
      Draft: 0,
      Submitted: 0,
      Approved: 0,
      Rejected: 0,
    };
    allProjectItems.forEach((it) => {
      if (statusCounts[it.status] !== undefined) {
        statusCounts[it.status] += 1;
      }
    });

    // All available sections for this project (for dropdown filters)
    const allSections = await BOQItem.distinct("section", { project: projectId });

    return res.status(200).json({
      success: true,
      data: {
        items,
        sections: Object.values(sectionMap),
        allSections: allSections.filter(Boolean).sort(),
        grandTotal: Math.round(overallGrandTotal * 100) / 100,
        filteredGrandTotal: Math.round(filteredGrandTotal * 100) / 100,
        statusCounts,
        pagination: {
          page,
          limit,
          total: totalFiltered,
          totalPages,
          totalOverall: overallTotalCount,
        },
      },
    });
  } catch (error) {
    console.error("Error getBOQByProject:", error);
    return handleError(res, error);
  }
};

/**
 * Get single BOQ item detail
 */
export const getBOQItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await BOQItem.findById(id).populate("createdBy", "username email avatar");

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item BOQ tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Create a new BOQ Item
 */
export const createBOQItem = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      itemCode,
      section,
      description,
      unit,
      quantity,
      unitPrice,
      notes,
      status,
    } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project tidak ditemukan",
      });
    }

    const cleanSection = section ? section.trim() : "";
    if (!cleanSection) {
      return res.status(400).json({
        success: false,
        message: "Section/Category wajib diisi",
      });
    }

    const numQty = Number(quantity);
    const numPrice = Number(unitPrice);

    if (isNaN(numQty) || numQty < 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity harus berupa angka dan tidak boleh negatif",
      });
    }

    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Unit Price harus berupa angka dan tidak boleh negatif",
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Deskripsi pekerjaan wajib diisi",
      });
    }

    if (!unit || !unit.trim()) {
      return res.status(400).json({
        success: false,
        message: "Satuan (unit) wajib diisi",
      });
    }

    const totalPrice = Math.round(numQty * numPrice * 100) / 100;

    const newItem = new BOQItem({
      project: projectId,
      itemCode: itemCode ? itemCode.trim() : "",
      section: cleanSection,
      description: description.trim(),
      unit: unit.trim(),
      quantity: numQty,
      unitPrice: numPrice,
      totalPrice,
      notes: notes ? notes.trim() : "",
      status: status || "Draft",
      createdBy: req.user?._id,
    });

    await newItem.save();
    await newItem.populate("createdBy", "username email avatar");

    return res.status(201).json({
      success: true,
      message: "Item BOQ berhasil ditambahkan",
      data: newItem,
    });
  } catch (error) {
    console.error("Error createBOQItem:", error);
    return handleError(res, error);
  }
};

/**
 * Update an existing BOQ Item
 */
export const updateBOQItem = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      itemCode,
      section,
      description,
      unit,
      quantity,
      unitPrice,
      notes,
      status,
    } = req.body;

    const item = await BOQItem.findById(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item BOQ tidak ditemukan",
      });
    }

    if (itemCode !== undefined) item.itemCode = itemCode ? itemCode.trim() : "";

    if (section !== undefined) {
      const cleanSection = section ? section.trim() : "";
      if (!cleanSection) {
        return res.status(400).json({
          success: false,
          message: "Section/Category tidak boleh kosong",
        });
      }
      item.section = cleanSection;
    }

    if (description !== undefined) {
      if (!description.trim()) {
        return res.status(400).json({
          success: false,
          message: "Deskripsi tidak boleh kosong",
        });
      }
      item.description = description.trim();
    }

    if (unit !== undefined) {
      if (!unit.trim()) {
        return res.status(400).json({
          success: false,
          message: "Satuan (unit) tidak boleh kosong",
        });
      }
      item.unit = unit.trim();
    }

    if (quantity !== undefined) {
      const numQty = Number(quantity);
      if (isNaN(numQty) || numQty < 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity harus berupa angka dan tidak boleh negatif",
        });
      }
      item.quantity = numQty;
    }

    if (unitPrice !== undefined) {
      const numPrice = Number(unitPrice);
      if (isNaN(numPrice) || numPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Unit Price harus berupa angka dan tidak boleh negatif",
        });
      }
      item.unitPrice = numPrice;
    }

    // Auto calculate Total Price
    item.totalPrice = Math.round(item.quantity * item.unitPrice * 100) / 100;

    if (notes !== undefined) item.notes = notes ? notes.trim() : "";
    if (status !== undefined) {
      const validStatuses = ["Draft", "Submitted", "Approved", "Rejected"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status tidak valid. Harus salah satu dari: ${validStatuses.join(", ")}`,
        });
      }
      item.status = status;
    }

    await item.save();
    await item.populate("createdBy", "username email avatar");

    return res.status(200).json({
      success: true,
      message: "Item BOQ berhasil diperbarui",
      data: item,
    });
  } catch (error) {
    console.error("Error updateBOQItem:", error);
    return handleError(res, error);
  }
};

/**
 * Update BOQ item status only
 */
export const updateBOQStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["Draft", "Submitted", "Approved", "Rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status tidak valid. Pilihan: ${validStatuses.join(", ")}`,
      });
    }

    const item = await BOQItem.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate("createdBy", "username email avatar");

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item BOQ tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Status BOQ berhasil diubah ke ${status}`,
      data: item,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Delete a BOQ Item
 */
export const deleteBOQItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await BOQItem.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item BOQ tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Item BOQ berhasil dihapus",
      data: { _id: id, project: item.project },
    });
  } catch (error) {
    console.error("Error deleteBOQItem:", error);
    return handleError(res, error);
  }
};
