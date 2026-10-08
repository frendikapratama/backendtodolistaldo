import "dotenv/config";
import mongoose from "mongoose";

if (!process.argv.includes("--apply")) {
  console.error(
    "This migration removes legacy BOQ unitPrice and totalPrice values. Re-run with --apply after backing up the database.",
  );
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection("boqitems");
  const affected = await collection.countDocuments({
    $or: [{ unitPrice: { $exists: true } }, { totalPrice: { $exists: true } }],
  });
  const result = await collection.updateMany(
    {},
    { $unset: { unitPrice: "", totalPrice: "" } },
  );
  console.log(
    `Removed legacy BOQ price fields from ${result.modifiedCount} of ${affected} documents.`,
  );
} finally {
  await mongoose.disconnect();
}
