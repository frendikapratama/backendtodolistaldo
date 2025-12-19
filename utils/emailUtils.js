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
    ? "Click the button below to accept the invitation:"
    : "Before accepting the invitation, you need to create an account:";

  const buttonText = isRegistered
    ? "Accept Invitation"
    : "Register and Accept Invitation";

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Invitation to Become PIC for Task: ${taskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Invitation to Become Task PIC</h2>
        <p>Hello,</p>
        <p>You have been invited to become the PIC (Person In Charge) for the following task:</p>
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
        <p>Or copy the link below into your browser:</p>
        <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
        <p>This invitation will expire in 7 days.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendWorkspaceInvitationEmail({
  to,
  workspaceName,
  inviteUrl,
  inviterName,
  role = "member",
}) {
  const roleText = {
    admin: "Admin",
    project_manager: "Project Manager",
    member: "Member",
    viewer: "Viewer",
  };

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Invitation to Join Workspace: ${workspaceName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Workspace Invitation</h2>
        <p>Hello,</p>
        <p>You have been invited ${
          inviterName ? `oleh <strong>${inviterName}</strong>` : ""
        } untuk bergabung ke workspace:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${workspaceName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Role: <strong>${
            roleText[role]
          }</strong></p>
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
        <p>This invitation will expire in 7 days.</p>
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

export async function sendTaskDueSoonEmail({
  to,
  taskName,
  projectName,
  workspaceName,
  dueDate,
  status,
  daysRemaining,
}) {
  let urgencyMessage = "";
  if (daysRemaining === 1) {
    urgencyMessage = "besok";
  } else if (daysRemaining === 7) {
    urgencyMessage = "dalam 1 minggu";
  } else {
    urgencyMessage = `dalam ${daysRemaining} hari`;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `⏰ Reminder: Task "${taskName}" Akan Jatuh Tempo`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">⏰ Task Akan Jatuh Tempo</h2>
        <p>Halo,</p>
        <p>Ini adalah pengingat bahwa task Anda akan segera jatuh tempo:</p>
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
          <p style="margin: 10px 0 5px 0; color: #92400e;"><strong>Jatuh tempo: ${urgencyMessage}</strong></p>
          <p style="margin: 5px 0; color: #6b7280;">Tanggal: ${new Date(
            dueDate
          ).toLocaleDateString("id-ID")}</p>
          <p style="margin: 5px 0; color: #6b7280;">Status saat ini: <strong>${status}</strong></p>
        </div>
        <p>Segera selesaikan task ini sebelum deadline!</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email reminder task due soon terkirim ke: ${to}`);
}

export async function sendTaskStatusChangedEmail({
  to,
  taskName,
  projectName,
  workspaceName,
  senderName,
  oldStatus,
  newStatus,
}) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `🔄 Status Task "${taskName}" Diupdate`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">🔄 Status Task Diupdate</h2>
        <p>Halo,</p>
        <p><strong>${senderName}</strong> telah mengubah status task:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
          <div style="margin-top: 10px; padding: 10px; background-color: white; border-radius: 4px;">
            <p style="margin: 0; color: #6b7280;">Status: <span style="text-decoration: line-through;">${oldStatus}</span> → <strong style="color: #2563eb;">${newStatus}</strong></p>
          </div>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email status change terkirim ke: ${to}`);
}

export async function sendTaskAssignedEmail({
  to,
  taskName,
  projectName,
  workspaceName,
  assignerName,
}) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `📋 Task Baru Ditugaskan: ${taskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">📋 Task Baru Ditugaskan</h2>
        <p>Halo,</p>
        <p><strong>${assignerName}</strong> telah menugaskan Anda pada task:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>Silakan cek aplikasi untuk detail lebih lanjut.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email task assignment terkirim ke: ${to}`);
}

export async function sendTaskOverdueEmail({
  to,
  taskName,
  projectName,
  workspaceName,
  dueDate,
  status,
  daysOverdue,
}) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `🚨 URGENT: Task "${taskName}" Sudah Terlambat ${daysOverdue} Hari`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">🚨 Task Terlambat!</h2>
        <p>Halo,</p>
        <p>Task Anda sudah melewati deadline dan masih belum selesai:</p>
        <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
          <p style="margin: 10px 0 5px 0; color: #991b1b;"><strong>⚠️ Terlambat: ${daysOverdue} hari</strong></p>
          <p style="margin: 5px 0; color: #6b7280;">Deadline: ${new Date(
            dueDate
          ).toLocaleDateString("id-ID")}</p>
          <p style="margin: 5px 0; color: #6b7280;">Status saat ini: <strong>${status}</strong></p>
        </div>
        <p style="color: #dc2626; font-weight: bold;">⚠️ Harap segera selesaikan task ini!</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email overdue task terkirim ke: ${to}`);
}

export async function sendSubtaskAssignedEmail({
  to,
  subtaskName,
  taskName,
  projectName,
  workspaceName,
  assignerName,
}) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `📋 Subtask Baru Ditugaskan: ${subtaskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">📋 Subtask Baru Ditugaskan</h2>
        <p>Halo,</p>
        <p><strong>${assignerName}</strong> telah menugaskan Anda pada subtask:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${subtaskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Task: ${taskName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>Silakan cek aplikasi untuk detail lebih lanjut.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email subtask assignment terkirim ke: ${to}`);
}
