import cron from "node-cron";
import Task from "../models/Task.js";
import Group from "../models/Group.js";
import {
  createTaskDueSoonNotification,
  createTaskOverdueNotification,
} from "../helpers/notificationHelper.js";
import { emitNotificationToUser } from "../sockets/socketHandler.js";

export function startTaskDueNotificationJob(io) {
  // Jalankan setiap hari jam 14:08 (2:08 PM)
  // Format: "menit jam * * *"
  cron.schedule("31 14 * * *", async () => {
    try {
      console.log("Running task due date notification check...");

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const daysToCheck = [7, 4, 2, 1];

      for (const days of daysToCheck) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);

        const targetDateEnd = new Date(targetDate);
        targetDateEnd.setHours(23, 59, 59, 999);

        const tasks = await Task.find({
          due_date: {
            $gte: targetDate,
            $lte: targetDateEnd,
          },
          status: { $in: ["In Progress", "To Do"] },
          pic: { $exists: true, $not: { $size: 0 } },
        }).populate({
          path: "groups",
          populate: {
            path: "project",
            populate: {
              path: "workspace",
              select: "nama",
            },
          },
        });

        console.log(`Found ${tasks.length} tasks due in ${days} day(s)`);

        for (const task of tasks) {
          const group = Array.isArray(task.groups)
            ? task.groups[0]
            : task.groups;

          if (!group?.project?.workspace) continue;

          const notifications = await createTaskDueSoonNotification({
            taskId: task._id,
            taskName: task.nama,
            workspaceId: group.project.workspace._id,
            workspaceName: group.project.workspace.nama,
            projectId: group.project._id,
            projectName: group.project.nama,
            recipients: task.pic,
            dueDate: task.due_date,
            status: task.status,
            daysRemaining: days,
          });

          // Emit socket notifications
          notifications.forEach((notification) => {
            emitNotificationToUser(io, notification.recipient, {
              _id: notification._id,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              metadata: notification.metadata,
              task: notification.task,
              isRead: false,
              createdAt: new Date(),
            });
          });
        }
      }

      console.log("Task due date notification check completed");
    } catch (error) {
      console.error("Error in task due notification job:", error);
    }
  });

  console.log("Task due notification job scheduled (runs daily at 14:08)");
}

export function startTaskOverdueNotificationJob(io) {
  // Jalankan setiap hari jam 14:14 (2:14 PM)
  cron.schedule("58 14 * * *", async () => {
    try {
      console.log("Running task overdue notification check...");
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueTasks = await Task.find({
        due_date: { $lt: today },
        status: { $in: ["To Do", "In Progress"] },
        pic: { $exists: true, $not: { $size: 0 } },
      }).populate({
        path: "groups",
        populate: {
          path: "project",
          populate: {
            path: "workspace",
            select: "nama",
          },
        },
      });

      console.log(`Found ${overdueTasks.length} overdue tasks`);

      for (const task of overdueTasks) {
        const group = Array.isArray(task.groups) ? task.groups[0] : task.groups;
        if (!group?.project?.workspace) continue;

        const daysOverdue = Math.floor(
          (today - new Date(task.due_date)) / (1000 * 60 * 60 * 24)
        );

        // Kirim notifikasi setiap kelipatan 3 hari
        if (daysOverdue > 0 && daysOverdue % 3 === 0) {
          console.log(
            `Processing overdue task: ${task.nama} (${daysOverdue} days overdue)`
          );

          const notifications = await createTaskOverdueNotification({
            taskId: task._id,
            taskName: task.nama,
            workspaceId: group.project.workspace._id,
            workspaceName: group.project.workspace.nama,
            projectId: group.project._id,
            projectName: group.project.nama,
            recipients: task.pic,
            dueDate: task.due_date,
            status: task.status,
            daysOverdue,
          });

          // PERBAIKAN: Emit socket untuk setiap notifikasi yang dibuat
          if (notifications && notifications.length > 0) {
            notifications.forEach((notification) => {
              emitNotificationToUser(io, notification.recipient, {
                _id: notification._id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                metadata: notification.metadata,
                task: notification.task,
                isRead: false,
                createdAt: notification.createdAt || new Date(),
              });
            });

            console.log(
              `✅ Sent ${notifications.length} overdue notifications for task "${task.nama}" (${daysOverdue} days overdue)`
            );
          }
        }
      }

      console.log("Task overdue notification check completed");
    } catch (error) {
      console.error("Error in task overdue notification job:", error);
    }
  });

  console.log("Task overdue notification job scheduled (runs daily at 14:14)");
}
