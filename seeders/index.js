import "dotenv/config";

import mongoose from "mongoose";

import seedDepartments from "./department.seeder.js";
import seedDivisions from "./division.seeder.js";
async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected");

    // await seedDepartments();``
    await seedDivisions();

    console.log("Seeding completed");
    ``;
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);

    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
