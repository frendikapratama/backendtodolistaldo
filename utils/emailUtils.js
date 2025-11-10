import { transporter } from "./sendEmail.js";

export async function sendTaskPicInvitationEmail({
  to,
  taskName,
  projectName,
  workspaceName,
  inviteUrl,
  isRegistered = false,
}) {
  const registrationText = isRegistered
    ? "Klik tombol di bawah ini untuk menerima undangan:"
    : "Sebelum menerima undangan, Anda perlu melakukan registrasi terlebih dahulu:";

  const buttonText = isRegistered
    ? "Terima Undangan"
    : "Daftar dan Terima Undangan";

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Undangan sebagai PIC untuk Task: ${taskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Undangan Menjadi PIC Task</h2>
        <p>Halo,</p>
        <p>Anda telah diundang untuk menjadi PIC (Person In Charge) pada task:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>${registrationText}</p>
        <a href="${inviteUrl}" 
           style="display: inline-block; background-color: #2563eb; color: white; 
                  padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                  margin: 15px 0;">
          ${buttonText}
        </a>
        <p>Atau copy link berikut ke browser Anda:</p>
        <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
        <p>Undangan ini akan kedaluwarsa dalam 7 hari.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email undangan PIC task terkirim ke: ${to}`);
}

export async function sendWorkspaceInvitationEmail({
  to,
  workspaceName,
  inviteUrl,
  inviterName,
}) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Undangan untuk bergabung ke Workspace: ${workspaceName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Undangan Workspace</h2>
        <p>Halo,</p>
        <p>Anda telah diundang ${
          inviterName ? `oleh <strong>${inviterName}</strong>` : ""
        } untuk bergabung ke workspace:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${workspaceName}</h3>
        </div>
        <p>Klik tombol di bawah ini untuk menerima undangan:</p>
        <a href="${inviteUrl}" 
           style="display: inline-block; background-color: #2563eb; color: white; 
                  padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                  margin: 15px 0;">
          Terima Undangan
        </a>
        <p>Atau copy link berikut ke browser Anda:</p>
        <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
        <p>Undangan ini akan kedaluwarsa dalam 7 hari.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email undangan workspace terkirim ke: ${to}`);
}

export async function sendSubtaskPicInvitationEmail({
  to,
  subTaskName,
  taskName,
  projectName,
  workspaceName,
  inviteUrl,
  isRegistered = false,
}) {
  const registrationText = isRegistered
    ? "Klik tombol di bawah ini untuk menerima undangan:"
    : "Sebelum menerima undangan, Anda perlu melakukan registrasi terlebih dahulu:";

  const buttonText = isRegistered
    ? "Terima Undangan"
    : "Daftar dan Terima Undangan";

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Undangan sebagai PIC untuk Subtask: ${subTaskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Undangan Menjadi PIC Subtask</h2>
        <p>Halo,</p>
        <p>Anda telah diundang untuk menjadi PIC (Person In Charge) pada subtask:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${subTaskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Task: ${taskName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>${registrationText}</p>
        <a href="${inviteUrl}" 
           style="display: inline-block; background-color: #2563eb; color: white; 
                  padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                  margin: 15px 0;">
          ${buttonText}
        </a>
        <p>Atau copy link berikut ke browser Anda:</p>
        <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
        <p>Undangan ini akan kedaluwarsa dalam 7 hari.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email undangan PIC subtask terkirim ke: ${to}`);
}
