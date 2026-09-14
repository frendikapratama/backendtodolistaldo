import Party from "../models/Party.js";
import { handleError } from "../utils/errorHandler.js";

export async function getParty(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

    const search = req.query.search?.trim() || "";

    const skip = (page - 1) * limit;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const [party, total] = await Promise.all([
      Party.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),

      Party.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: "Successfully retrieved party",
      data: party,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createParty(req, res) {
  try {
    const party = new Party(req.body);
    await party.save();

    res.status(201).json({
      success: true,
      message: "Party created successfully",
      data: party,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateParty(req, res) {
  try {
    const { id } = req.params;

    const party = await Party.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Party not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Party updated successfully",
      data: party,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteParty(req, res) {
  try {
    const { id } = req.params;

    const party = await Party.findByIdAndDelete(id);

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Party not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Party deleted successfully",
      data: party,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
