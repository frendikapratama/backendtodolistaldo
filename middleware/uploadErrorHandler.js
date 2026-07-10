import multer from "multer";

export const uploadErrorHandler = (err, req, res, next) => {
  if (!err) return next();

  // Error dari Multer
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          success: false,
          message: "File size exceeds the maximum limit of 10 MB.",
        });

      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          message: "Maximum 5 files are allowed.",
        });

      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          message: "Unsupported file type.",
        });

      default:
        return res.status(400).json({
          success: false,
          message: err.message,
        });
    }
  }

  // Error biasa
  return res.status(400).json({
    success: false,
    message: err.message || "File upload failed.",
  });
};
