import Notification from "../models/Notification.js";
import {
  sendTaskDueSoonEmail,
  sendTaskStatusChangedEmail,
  sendTaskAssignedEmail,
  sendTaskOverdueEmail,
  sendSubtaskAssignedEmail,
  sendDoneInReviewEmail,
} from "../utils/emailUtils.js";
import {
  sendDoneInReviewWA,
  sendDueSoonWA,
  sendOverdueWA,
} from "../utils/taskWhatsAppService.js";
import User from "../models/User.js";

export async function createTaskDueSoonNotification({
  taskId,
  taskName,
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  recipients,
  dueDate,
  status,
  daysRemaining,
}) {
  try {
    let urgencyMessage = "";
    if (daysRemaining === 1) {
      urgencyMessage = "tommorow";
    } else if (daysRemaining === 7) {
      urgencyMessage = "in 1 week";
    } else {
      urgencyMessage = `in ${daysRemaining} days`;
    }

    const notifications = recipients.map((recipientId) => ({
      recipient: recipientId,
      type: "TASK_DUE_SOON",
      title: "Task is due soon",
      message: `Task "${taskName}" will be due on ${urgencyMessage} (${new Date(
        dueDate,
      ).toLocaleDateString("id-ID")}) and still has status ${status}`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        taskName,
        projectName,
        workspaceName,
        dueDate,
        status,
        daysRemaining,
      },
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);

      User.find({ _id: { $in: recipients } })
        .select("email noHp")
        .then((users) => {
          users.forEach((user) => {
            // Email
            sendTaskDueSoonEmail({
              to: user.email,
              taskName,
              projectName,
              workspaceName,
              dueDate,
              status,
              daysRemaining,
            }).catch((err) =>
              console.error(`Failed to send email to ${user.email}:`, err),
            );

            // WhatsApp
            if (user.noHp) {
              sendDueSoonWA({
                noHp: user.noHp,
                taskName,
                projectName,
                workspaceName,
                dueDate,
                status,
                daysRemaining,
              }).catch((err) =>
                console.error(`Failed to send WA to ${user.noHp}:`, err),
              );
            }
          });
        })
        .catch((err) => console.error("Error fetching users for due soon notif:", err));
    }

    return notifications;
  } catch (error) {
    console.error("Error creating task due soon notification:", error);
    throw error;
  }
}

export async function createTaskStatusNotification({
  taskId,
  taskName,
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  senderId,
  senderName,
  recipients,
  oldStatus,
  newStatus,
  // Untuk Done-In Review: informasi tambahan
  subtaskName = null,
  itemType = "Task",
}) {
  try {
    const notifications = recipients
      .filter((recipientId) => recipientId.toString() !== senderId.toString())
      .map((recipientId) => ({
        recipient: recipientId,
        sender: senderId,
        type: "TASK_STATUS_CHANGED",
        title: newStatus === "Done-In review"
          ? `${itemType} Needs Review`
          : "Task status updated",
        message: newStatus === "Done-In review"
          ? `${senderName} telah menandai ${itemType.toLowerCase()} "${subtaskName || taskName}" sebagai Done-In Review. Mohon lakukan review.`
          : `${senderName} changed the status of the task "${taskName}" from ${oldStatus} to ${newStatus}`,
        task: taskId,
        workspace: workspaceId,
        project: projectId,
        metadata: {
          oldStatus,
          newStatus,
          taskName,
          subtaskName,
          itemType,
          projectName,
          workspaceName,
        },
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);

      // Kirim Email + WA untuk status Done-In Review
      if (newStatus === "Done-In review") {
        const recipientIds = recipients.filter(
          (id) => id.toString() !== senderId.toString(),
        );

        User.find({ _id: { $in: recipientIds } })
          .select("email noHp")
          .then((users) => {
            users.forEach((user) => {
              // Email
              sendDoneInReviewEmail({
                to: user.email,
                taskName,
                subtaskName,
                projectName,
                workspaceName,
                changerName: senderName,
                itemType,
              }).catch((err) =>
                console.error(`[Done-In Review] Email error to ${user.email}:`, err),
              );

              // WhatsApp
              if (user.noHp) {
                sendDoneInReviewWA({
                  noHp: user.noHp,
                  taskName,
                  subtaskName,
                  projectName,
                  workspaceName,
                  changerName: senderName,
                }).catch((err) =>
                  console.error(`[Done-In Review] WA error to ${user.noHp}:`, err),
                );
              }
            });
          })
          .catch((err) =>
            console.error("[Done-In Review] Error fetching users:", err),
          );
      }
    }

    return notifications;
  } catch (error) {
    console.error("Error creating task status notification:", error);
    throw error;
  }
}

export async function createTaskAssignmentNotification({
  taskId,
  taskName,
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  senderId,
  senderName,
  recipientId,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "TASK_ASSIGNED",
      title: "New task assigned",
      message: `${senderName} assigned you on task "${taskName}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        taskName,
        projectName,
        workspaceName,
      },
    });

    User.findById(recipientId)
      .select("email")
      .then((user) => {
        if (user) {
          sendTaskAssignedEmail({
            to: user.email,
            taskName,
            projectName,
            workspaceName,
            assignerName: senderName,
          }).catch((err) =>
            console.error(`Failed to send assignment email:`, err),
          );
        }
      })
      .catch((err) => console.error("Error fetching user for email:", err));

    return notification;
  } catch (error) {
    console.error("Error creating task assignment notification:", error);
    throw error;
  }
}

export async function getUnreadCount(userId) {
  try {
    const count = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });
    return count;
  } catch (error) {
    console.error("Error getting unread count:", error);
    return 0;
  }
}

export async function markAsRead(notificationId, userId) {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: userId,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    );
    return notification;
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
}

export async function markAllAsRead(userId) {
  try {
    const result = await Notification.updateMany(
      {
        recipient: userId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
    return result;
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
}

export async function createTaskOverdueNotification({
  taskId,
  taskName,
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  recipients,
  dueDate,
  status,
  daysOverdue,
}) {
  try {
    console.log(
      `Creating overdue notifications for ${recipients.length} recipients`,
    );

    const notifications = recipients.map((recipientId) => ({
      recipient: recipientId,
      type: "TASK_OVERDUE",
      title: "Task is overdue",
      message: `Task "${taskName}" is overdue by ${daysOverdue} days. (deadline: ${new Date(
        dueDate,
      ).toLocaleDateString("id-ID")}), Current status ${status}`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        taskName,
        projectName,
        workspaceName,
        dueDate,
        status,
        daysOverdue,
      },
    }));

    let savedNotifications = [];
    if (notifications.length > 0) {
      savedNotifications = await Notification.insertMany(notifications);
      console.log(
        `Saved ${savedNotifications.length} overdue notifications to database`,
      );

      User.find({ _id: { $in: recipients } })
        .select("email noHp")
        .then((users) => {
          console.log(`Sending overdue emails+WA to ${users.length} users`);
          users.forEach((user) => {
            // Email
            sendTaskOverdueEmail({
              to: user.email,
              taskName,
              projectName,
              workspaceName,
              dueDate,
              status,
              daysOverdue,
            }).catch((err) =>
              console.error(
                `Failed to send overdue email to ${user.email}:`,
                err,
              ),
            );

            // WhatsApp
            if (user.noHp) {
              sendOverdueWA({
                noHp: user.noHp,
                taskName,
                projectName,
                workspaceName,
                dueDate,
                status,
                daysOverdue,
              }).catch((err) =>
                console.error(`Failed to send overdue WA to ${user.noHp}:`, err),
              );
            }
          });
        })
        .catch((err) =>
          console.error("Error fetching users for overdue notif:", err),
        );
    }

    return savedNotifications;
  } catch (error) {
    console.error("Error creating task overdue notification:", error);
    throw error;
  }
}

export async function createCommentNotification({
  recipientId,
  senderId,
  taskId,
  taskName,
  workspaceId,
  projectId,
  senderName,
  commentText,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "TASK_COMMENT",
      title: `New Comment on Task`,
      message: `${senderName} commented on "${taskName}": "${commentText.substring(
        0,
        50,
      )}${commentText.length > 50 ? "..." : ""}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        taskName,
        senderName,
        commentText,
      },
    });

    return notification;
  } catch (error) {
    console.error("Error creating comment notification:", error);
  }
}

export async function createReplyCommentNotification({
  recipientId,
  senderId,
  taskId,
  taskName,
  workspaceId,
  projectId,
  senderName,
  replyText,
  parentCommentId,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "TASK_REPLY_COMMENT",
      title: `New Reply on Comment`,
      message: `${senderName} replied to your comment on "${taskName}": "${replyText.substring(
        0,
        50,
      )}${replyText.length > 50 ? "..." : ""}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        taskName,
        senderName,
        replyText,
        parentCommentId,
      },
    });

    return notification;
  } catch (error) {
    console.error("Error creating reply comment notification:", error);
  }
}

export async function createAttachmentNotification({
  recipientId,
  senderId,
  taskId,
  taskName,
  workspaceId,
  projectId,
  senderName,
  fileName,
  fileUrl,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "TASK_ATTACHMENT_UPLOADED",
      title: `File Uploaded to Task`,
      message: `${senderName} uploaded a file "${fileName}" to "${taskName}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        taskName,
        senderName,
        fileName,
        fileUrl,
      },
    });

    return notification;
  } catch (error) {
    console.error("Error creating attachment notification:", error);
  }
}

export async function createSubtaskStatusNotification({
  subtaskId,
  subtaskName,
  taskId,
  taskName,
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  senderId,
  senderName,
  recipients,
  oldStatus,
  newStatus,
}) {
  try {
    const notifications = recipients
      .filter((recipientId) => recipientId.toString() !== senderId.toString())
      .map((recipientId) => ({
        recipient: recipientId,
        sender: senderId,
        type: "TASK_STATUS_CHANGED",
        title: "Status Subtask updated",
        message: `${senderName} updated status on subtask "${subtaskName}" to task "${taskName}" from ${oldStatus} to ${newStatus}`,
        task: taskId,
        workspace: workspaceId,
        project: projectId,
        metadata: {
          subtaskName,
          taskName,
          projectName,
          workspaceName,
          oldStatus,
          newStatus,
        },
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    return notifications;
  } catch (error) {
    console.error("Error creating subtask status notification:", error);
    throw error;
  }
}

export async function createSubtaskAssignmentNotification({
  subtaskId,
  subtaskName,
  taskId,
  taskName,
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  senderId,
  senderName,
  recipientId,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "TASK_ASSIGNED",
      title: "New subtask assigned",
      message: `${senderName} assigned you to the subtask "${subtaskName}" in the task "${taskName}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        subtaskName,
        taskName,
        projectName,
        workspaceName,
      },
    });

    User.findById(recipientId)
      .select("email")
      .then((user) => {
        if (user) {
          sendSubtaskAssignedEmail({
            to: user.email,
            subtaskName,
            taskName,
            projectName,
            workspaceName,
            assignerName: senderName,
          }).catch((err) =>
            console.error(`Failed to send subtask assignment email:`, err),
          );
        }
      })
      .catch((err) => console.error("Error fetching user for email:", err));

    return notification;
  } catch (error) {
    console.error("Error creating subtask assignment notification:", error);
    throw error;
  }
}

export async function createSubtaskCommentNotification({
  recipientId,
  senderId,
  subtaskId,
  subtaskName,
  taskId,
  taskName,
  workspaceId,
  projectId,
  senderName,
  commentText,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "SUBTASK_COMMENT",
      title: `New Comment on Subtask`,
      message: `${senderName} commented on subtask "${subtaskName}": "${commentText.substring(
        0,
        50,
      )}${commentText.length > 50 ? "..." : ""}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        subtaskName,
        taskName,
        senderName,
        commentText,
      },
    });

    return notification;
  } catch (error) {
    console.error("Error creating subtask comment notification:", error);
  }
}

export async function createSubtaskAttachmentNotification({
  recipientId,
  senderId,
  subtaskId,
  subtaskName,
  taskId,
  taskName,
  workspaceId,
  projectId,
  senderName,
  fileName,
  fileUrl,
}) {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "SUBTASK_ATTACHMENT_UPLOADED",
      title: `File Uploaded to Subtask`,
      message: `${senderName} uploaded a file "${fileName}" to subtask "${subtaskName}"`,
      task: taskId,
      workspace: workspaceId,
      project: projectId,
      metadata: {
        subtaskName,
        taskName,
        senderName,
        fileName,
        fileUrl,
      },
    });

    return notification;
  } catch (error) {
    console.error("Error creating subtask attachment notification:", error);
  }
}
