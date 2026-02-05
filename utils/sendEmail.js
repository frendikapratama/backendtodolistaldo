import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();
export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    // user: "frendikapratama28@gmail.com",
    // pass: "dlvpcuypehhywuuq"
    user: process.env.EMAIL_USER || "frendikapratama28@gmail.com",
    pass: process.env.EMAIL_PASS || "dlvpcuypehhywuuq",
  },
});

// export const transporter = nodemailer.createTransport({
//   host: "mail.alkindo.co.id",
//   port: 465,
//   secure: true,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });
