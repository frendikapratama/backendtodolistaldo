import Division from "../models/Division.js";
import { handleError } from "../utils/errorHandler.js";
export async function getAllDivisions(req, res) {
  try {
    const divisions = await Division.find().select("-__v");

    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data: divisions,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
