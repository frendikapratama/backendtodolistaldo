import Workspace from "../models/Workspace.js";
import Task from "../models/Task.js";
import Group from "../models/Group.js";
import Project from "../models/Project.js";
import Subtask from "../models/Subtask.js";

export async function validateWorkspaceAccess(workspaceId, userId) {
  try {
    if (!workspaceId) {
      return {
        valid: false,
        status: 400,
        message: "Workspace ID tidak valid",
      };
    }

    if (!userId) {
      return {
        valid: false,
        status: 400,
        message: "User ID tidak valid",
      };
    }

    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return {
        valid: false,
        status: 404,
        message: "Workspace tidak ditemukan",
      };
    }

    const userIdString = userId.toString();
    const ownerIdString = workspace.owner ? workspace.owner.toString() : null;

    const isOwner = ownerIdString === userIdString;
    const isMember =
      workspace.members &&
      workspace.members.some(
        (memberId) => memberId.toString() === userIdString
      );

    if (!isOwner && !isMember) {
      return {
        valid: false,
        status: 403,
        message: "Anda tidak memiliki akses ke workspace ini",
      };
    }

    return { valid: true, workspace };
  } catch (error) {
    console.error("Error in validateWorkspaceAccess:", error);
    return {
      valid: false,
      status: 500,
      message: `Error validasi akses: ${error.message}`,
    };
  }
}

export async function getWorkspaceFromTask(taskId) {
  const task = await Task.findById(taskId).populate("groups");
  if (!task) {
    return { success: false, status: 404, message: "Task tidak ditemukan" };
  }

  const group = await Group.findById(task.groups).populate("project");
  if (!group || !group.project) {
    return {
      success: false,
      status: 404,
      message: "Group atau Project tidak ditemukan",
    };
  }

  const project = await Project.findById(group.project).populate("workspace");
  if (!project || !project.workspace) {
    return {
      success: false,
      status: 404,
      message: "Project atau Workspace tidak ditemukan",
    };
  }

  return {
    success: true,
    workspace: project.workspace,
    project: project,
    group: group,
    task: task,
  };
}

export async function getWorkspaceFromSubtask(subtaskId) {
  const subtask = await Subtask.findById(subtaskId).populate("task");
  if (!subtask) {
    return { success: false, status: 404, message: "Subtask tidak ditemukan" };
  }

  const task = await Task.findById(subtask.task).populate("groups");
  if (!task) {
    return { success: false, status: 404, message: "Task tidak ditemukan" };
  }

  const group = await Group.findById(task.groups).populate("project");
  if (!group || !group.project) {
    return {
      success: false,
      status: 404,
      message: "Group atau Project tidak ditemukan",
    };
  }

  const project = await Project.findById(group.project).populate("workspace");
  if (!project || !project.workspace) {
    return {
      success: false,
      status: 404,
      message: "Project atau Workspace tidak ditemukan",
    };
  }

  return {
    success: true,
    workspace: project.workspace,
    project: project,
    group: group,
    task: task,
    subtask: subtask,
  };
}
