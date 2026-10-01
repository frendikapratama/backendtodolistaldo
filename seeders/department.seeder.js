import Department from "../models/Department.js";

const departments = [
  { name: "IT" },
  { name: "Finance" },
  { name: "Human Resources" },
  { name: "Procurement" },
];

async function seedDepartments() {
  for (const department of departments) {
    await Department.updateOne(
      { name: department.name },
      { $set: department },
      { upsert: true },
    );
  }

  console.log("Departments seeded successfully");
}

export default seedDepartments;
