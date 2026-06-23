import Facility from "../models/Facility.js";
import Room from "../models/Room.js";
import { handleError } from "../utils/errorHandler.js";

export async function getFacilities(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    let filter = {};
    if (search) {
      filter = {
        nama: { $regex: search, $options: "i" },
      };
    }

    const [facilities, total] = await Promise.all([
      Facility.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      Facility.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      message: "Berhasil mengambil data",
      data: facilities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function createFacility(req, res) {
  try {
    const { nama } = req.body;
    const facility = new Facility({ nama });
    await facility.save();
    res.status(200).json({
      success: true,
      message: "create facility successfully",
      data: facility,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function deleteFacility(req, res) {
  try {
    const { id } = req.params;

    const facility = await Facility.findById(id);

    if (!facility) {
      return res
        .status(404)
        .json({ success: false, message: "Facility not found" });
    }

    const updateRooms = await Room.updateMany(
      { "facilities.facilityId": id },
      { $pull: { facilities: { facilityId: id } } },
    );

    await Facility.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Facility deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function updateFacility(req, res) {
  try {
    const { id } = req.params;
    const { nama } = req.body;

    const facility = await Facility.findByIdAndUpdate(
      id,
      {
        nama: nama.toLowerCase().trim(),
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!facility) {
      return res.status(404).json({
        success: false,
        message: "Facility not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Facility updated successfully",
      data: facility,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Facility name already exists",
      });
    }

    handleError(res, error);
  }
}
