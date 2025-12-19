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
    : "Before accepting the invitation, you need to register first:";

  const buttonText = isRegistered
    ? "Accept Invitation"
    : "Register and Accept Invitation";

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Invitation to be PIC for Task: ${taskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Invitation to be PIC Task</h2>
        <p>Hello,</p>
        <p>You have been invited to become the PIC (Person In Charge) for the task:</p>
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
        <p>Or copy the following link to your browser:</p>
        <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
        <p>This invitation will expire in 7 days.</p>
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
    subject: `Invitation to join Workspace: ${workspaceName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Workspace Invitation</h2>
        <p>Hello,</p>
        <p>You have been invited ${
          inviterName ? `by <strong>${inviterName}</strong>` : ""
        } to join the workspace:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${workspaceName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Role: <strong>${
            roleText[role]
          }</strong></p>
        </div>
        <p>Click the button below to accept the invitation:</p>
        <a href="${inviteUrl}" 
           style="display: inline-block; background-color: #2563eb; color: white; 
                  padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                  margin: 15px 0;">
          Accept Invitation
        </a>
        <p>Or copy the following link to your browser:</p>
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
  const buttonText = isRegistered
    ? "Click the button below to accept the invitation:"
    : "Before accepting the invitation, you need to register first:";

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Invitation to be PIC for Subtask: ${subTaskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Invitation to be PIC Subtask</h2>
        <p>Hello,</p>
        <p>You have been invited to become the PIC (Person In Charge) for the subtask:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${subTaskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Task: ${taskName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>${buttonText}</p>
        <a href="${inviteUrl}" 
           style="display: inline-block; background-color: #2563eb; color: white; 
                  padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                  margin: 15px 0;">
          ${buttonText}
        </a>
        <p>Or copy the following link to your browser:</p>
        <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
        <p>This invitation will expire in 7 days.</p>
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
    urgencyMessage = "Tomorrow";
  } else if (daysRemaining === 7) {
    urgencyMessage = "in 1 week";
  } else {
    urgencyMessage = `in ${daysRemaining} days`;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `⏰ Reminder: Task "${taskName}" is Due `,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">⏰ Task Due Soon</h2>
        <p>Hello,</p>
        <p>This is a reminder that your task will soon be due:</p>
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
          <p style="margin: 10px 0 5px 0; color: #92400e;"><strong>Due date: ${urgencyMessage}</strong></p>
          <p style="margin: 5px 0; color: #6b7280;">Date: ${new Date(
            dueDate
          ).toLocaleDateString("id-ID")}</p>
          <p style="margin: 5px 0; color: #6b7280;">Current status: <strong>${status}</strong></p>
        </div>
        <p>Complete this task before the deadline!</p>
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
    subject: `🔄 Status Task "${taskName}" updated`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">🔄 Status Task Updated</h2>
        <p>Hello,</p>
        <p><strong>${senderName}</strong> has changed the task status:</p>
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
    subject: `📋 New task assigned: ${taskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">📋 New task assigned</h2>
        <p>Hello,</p>
        <p><strong>${assignerName}</strong> has assigned you a new task:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>Please check the application for more details.</p>
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
    subject: `🚨 URGENT: Task "${taskName}" is overdue by ${daysOverdue} days`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">🚨 Task Overdue!</h2>
        <p>Hello,</p>
        <p>Your task has exceeded its deadline and is still incomplete:</p>
        <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626;">
          <h3 style="margin: 0; color: #1f2937;">${taskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
          <p style="margin: 10px 0 5px 0; color: #991b1b;"><strong>⚠️ Overdue: ${daysOverdue} days</strong></p>
          <p style="margin: 5px 0; color: #6b7280;">Deadline: ${new Date(
            dueDate
          ).toLocaleDateString("id-ID")}</p>
          <p style="margin: 5px 0; color: #6b7280;">Current status: <strong>${status}</strong></p>
        </div>
        <p style="color: #dc2626; font-weight: bold;">⚠️ Please complete this task as soon as possible!</p>
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
    subject: `📋 New subtask assigned: ${subtaskName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">📋 New subtask assigned</h2>
        <p>Hello,</p>
        <p><strong>${assignerName}</strong> has assigned you a new subtask:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0; color: #1f2937;">${subtaskName}</h3>
          <p style="margin: 5px 0; color: #6b7280;">Task: ${taskName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Project: ${projectName}</p>
          <p style="margin: 5px 0; color: #6b7280;">Workspace: ${workspaceName}</p>
        </div>
        <p>Please check the application for more details.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📨 Email subtask assignment terkirim ke: ${to}`);
}
