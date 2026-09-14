import Division from "../models/Division.js";

const divisions = [
  {
    name: "IT",
  },
  {
    name: "Production",
  },
  {
    name: "Accounting",
  },
  {
    name: "Corporate Secretary",
  },
  {
    name: "Collector",
  },
  {
    name: "Audit Internal",
  },
  {
    name: "Administration",
  },
  {
    name: "PPIC - PT",
  },
  {
    name: "PPIC - HPC",
  },
  {
    name: "PPIC - PT",
  },
  {
    name: "PPIC - PBPG",
  },
  {
    name: "Designer",
  },
  {
    name: "Costing",
  },
  {
    name: "Marketing",
  },
  {
    name: "Purchasing",
  },
  {
    name: "Invoicing",
  },
  {
    name: "QC - RND",
  },
  {
    name: "CSD",
  },
  {
    name: "HRD",
  },
  {
    name: "GA",
  },
  {
    name: "Finance",
  },
  {
    name: "Management Trainee",
  },
  {
    name: "Engineering",
  },
  {
    name: "Raw Material",
  },
  {
    name: "Material Support",
  },
  {
    name: "Finished Goods",
  },
  9,
];

async function seedDivisions() {
  for (const division of divisions) {
    await Division.updateOne(
      { name: division.name },
      { $set: division },
      { upsert: true },
    );
  }

  console.log("Divisions seeded successfully");
}
export default seedDivisions;
