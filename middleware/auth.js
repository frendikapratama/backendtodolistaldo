import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Group from "../models/Group.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";
import Subtask from "../models/Subtask.js";
import CollaborationRequest from "../models/CollaborationRequest.js";
import {
  canAccessTaskType,
  getAllowedTaskTypes,
  getRoleDescription,
} from "../utils/roleTaskUtils.js";
const JWT_SECRET =
  process.env.TOKEN_SECRET ||
  "48db792b7ced19872b7109589afb94bb084acf4b5ef0879ccc5855395cb44a5e";

// export async function authenticate(req, res, next) {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith("Bearer")) {
//       return res.status(401).json({ message: "Youd don't have access" });
//     }

//     const token = authHeader.split(" ")[1];

//     const decoded = jwt.verify(token, JWT_SECRET);

//     const user = await User.findById(decoded.id).select("-password");
//     if (!user) {
//       return res.status(401).json({ message: "user not found" });
//     }

//     req.user = user;
//     next();
//   } catch (error) {
//     console.error("Authentication error:", error.message);
//     res.status(401).json({
//       message: "Autentikasi gagal",
//       error: error.message,
//     });
//   }
// }


export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer")) {
      return res.status(401).json({
        message: "No authorization token provided"
      });
    }
    const token = authHeader.split(" ")[1];
    if (!token || token === "undefined" || token === "null") {
      return res.status(401).json({
        message: "Invalid token format"
      });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: "Token expired",
          expired: true
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          message: "Invalid token",
          error: jwtError.message
        });
      }
      return res.status(401).json({
        message: "Token verification failed",
        error: jwtError.message
      });
    }
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        message: "User not found"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      message: "Authentication failed",
      error: error.message,
    });
  }
}
export function requireSystemAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "you don't have access" });
  }

  if (req.user.role !== "system_admin" && req.user.isSystemAdmin !== true) {
    return res.status(403).json({
      message: "Only System Admin can perform this action",
    });
  }

  next();
}

export function checkWorkspaceRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user._id;

      if (req.user.isSystemAdmin === true) {
        req.userWorkspaceRole = "system_admin";
        req.isSystemAdmin = true;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
          return res.status(404).json({
            success: false,
            message: "Division not found",
          });
        }
        req.workspace = workspace;
        return next();
      }

      const workspace = await Workspace.findById(workspaceId);

      if (!workspace) {
        return res.status(404).json({
          success: false,
          message: "Division not found",
        });
      }

      if (workspace.owner.toString() === userId.toString()) {
        req.userWorkspaceRole = "admin";
        req.workspace = workspace;
        return next();
      }

      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "you are not a member of this division",
        });
      }

      req.userWorkspaceRole = member.role;
      req.workspace = workspace;

      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message: `This action requires a role:  ${allowedRoles.join(
            " Or "
          )}. Your role is: ${member.role}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Vailed to verify division role",
        error: error.message,
      });
    }
  };
}

export function checkWorkspaceRoleFromProject(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const userId = req.user._id;

      if (req.user.isSystemAdmin === true) {
        req.userWorkspaceRole = "system_admin";
        req.isSystemAdmin = true;

        const project = await Project.findById(projectId).populate("workspace");
        if (!project || !project.workspace) {
          return res.status(404).json({
            success: false,
            message: "Project or Division not found",
          });
        }
        req.workspace = project.workspace;
        req.project = project;
        return next();
      }

      const project = await Project.findById(projectId).populate("workspace");

      if (!project || !project.workspace) {
        return res.status(404).json({
          success: false,
          message: "Project or Division not found",
        });
      }

      const workspace = project.workspace;

      if (workspace.owner.toString() === userId.toString()) {
        req.userWorkspaceRole = "admin";
        req.workspace = workspace;
        req.project = project;
        return next();
      }

      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "Yiou are not a member of this division",
        });
      }

      req.userWorkspaceRole = member.role;
      req.workspace = workspace;
      req.project = project;

      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message: `This action requires a role: ${allowedRoles.join(
            " or "
          )}. Your role is: ${member.role}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify division role",
        error: error.message,
      });
    }
  };
}

export function checkWorkspaceRoleFromTask(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const userId = req.user._id;

      if (req.user.isSystemAdmin === true) {
        req.userWorkspaceRole = "system_admin";
        req.isSystemAdmin = true;

        const task = await Task.findById(taskId);
        if (!task) {
          return res.status(404).json({
            success: false,
            message: "task not found",
          });
        }

        const group = await Group.findById(task.groups);
        if (!group) {
          return res.status(404).json({
            success: false,
            message: "Group not found",
          });
        }

        const project = await Project.findById(group.project).populate(
          "workspace"
        );
        if (!project || !project.workspace) {
          return res.status(404).json({
            success: false,
            message: "Project or Division not found",
          });
        }

        req.workspace = project.workspace;
        req.task = task;
        return next();
      }

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      const group = await Group.findById(task.groups);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: "Group not found",
        });
      }

      const project = await Project.findById(group.project).populate(
        "workspace"
      );
      if (!project || !project.workspace) {
        return res.status(404).json({
          success: false,
          message: "Project or Division not found",
        });
      }

      const workspace = project.workspace;

      if (workspace.owner.toString() === userId.toString()) {
        req.userWorkspaceRole = "admin";
        req.workspace = workspace;
        req.task = task;
        return next();
      }

      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this division",
        });
      }

      req.userWorkspaceRole = member.role;
      req.workspace = workspace;
      req.task = task;

      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message: `This action requires a role: ${allowedRoles.join(
            " or "
          )}. Your role is: ${member.role}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify division role",
        error: error.message,
      });
    }
  };
}

export function checkWorkspaceRoleFromSubtask(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const { subTaskId } = req.params;
      const userId = req.user._id;

      if (req.user.isSystemAdmin === true) {
        req.userWorkspaceRole = "system_admin";
        req.isSystemAdmin = true;

        const subtask = await Subtask.findById(subTaskId);
        if (!subtask) {
          return res.status(404).json({
            success: false,
            message: "Subtask not found",
          });
        }

        const task = await Task.findById(subtask.task);
        if (!task) {
          return res.status(404).json({
            success: false,
            message: "Task not found",
          });
        }

        const group = await Group.findById(task.groups);
        if (!group) {
          return res.status(404).json({
            success: false,
            message: "Group not found",
          });
        }

        const project = await Project.findById(group.project).populate(
          "workspace"
        );
        if (!project || !project.workspace) {
          return res.status(404).json({
            success: false,
            message: "Project or Division not found",
          });
        }

        req.workspace = project.workspace;
        req.subtask = subtask;
        return next();
      }

      const subtask = await Subtask.findById(subTaskId);
      if (!subtask) {
        return res.status(404).json({
          success: false,
          message: "Subtask not found",
        });
      }

      const task = await Task.findById(subtask.task);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      const group = await Group.findById(task.groups);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: "Group tidak ditemukan",
        });
      }

      const project = await Project.findById(group.project).populate(
        "workspace"
      );
      if (!project || !project.workspace) {
        return res.status(404).json({
          success: false,
          message: "Project or Division not found",
        });
      }

      const workspace = project.workspace;

      if (workspace.owner.toString() === userId.toString()) {
        req.userWorkspaceRole = "admin";
        req.workspace = workspace;
        req.subtask = subtask;
        return next();
      }

      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this division",
        });
      }

      req.userWorkspaceRole = member.role;
      req.workspace = workspace;
      req.subtask = subtask;

      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message: `This action requires a role: ${allowedRoles.join(
            " or "
          )}. Your role is: ${member.role}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify division role",
        error: error.message,
      });
    }
  };
}

export async function checkWorkspaceMemberFromTask(req, res, next) {
  try {
    const { taskId } = req.params;
    const userId = req.user._id;

    if (req.user.isSystemAdmin === true) {
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }
      const group = await Group.findById(task.groups);
      const project = await Project.findById(group.project).populate(
        "workspace"
      );
      req.task = task;
      req.workspace = project.workspace;
      req.isSystemAdmin = true;
      return next();
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }
    const group = await Group.findById(task.groups);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }
    const project = await Project.findById(group.project).populate("workspace");
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }
    if (!project.workspace) {
      return res.status(404).json({
        success: false,
        message: "Division not found",
      });
    }
    const isMember = project.workspace.members.some(
      (member) => member.user.toString() === userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this division",
      });
    }
    req.task = task;
    req.workspace = project.workspace;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to verify division access",
      error: error.message,
    });
  }
}

export function checkWorkspaceRoleFromGroup(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const { groupId } = req.params || req.body;
      const userId = req.user._id;

      if (req.user.isSystemAdmin === true) {
        req.userWorkspaceRole = "system_admin";
        req.isSystemAdmin = true;

        const group = await Group.findById(groupId);
        if (!group) {
          return res.status(404).json({
            success: false,
            message: "Group not found",
          });
        }

        const project = await Project.findById(group.project).populate(
          "workspace"
        );
        if (!project || !project.workspace) {
          return res.status(404).json({
            success: false,
            message: "Project or Division not found",
          });
        }

        req.workspace = project.workspace;
        req.group = group;
        return next();
      }

      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: "Group not found",
        });
      }

      const project = await Project.findById(group.project).populate(
        "workspace"
      );
      if (!project || !project.workspace) {
        return res.status(404).json({
          success: false,
          message: "Project or Division not found",
        });
      }

      const workspace = project.workspace;

      if (workspace.owner.toString() === userId.toString()) {
        req.userWorkspaceRole = "admin";
        req.workspace = workspace;
        req.group = group;
        return next();
      }

      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this division",
        });
      }

      req.userWorkspaceRole = member.role;
      req.workspace = workspace;
      req.group = group;

      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message: `This action requires a role: ${allowedRoles.join(
            " or "
          )}. Your role is: ${member.role}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Gagal memverifikasi role workspace",
        error: error.message,
      });
    }
  };
}

export function checkWorkspaceRoleForCollaboration(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;

      if (req.user.isSystemAdmin === true) {
        req.userWorkspaceRole = "system_admin";
        req.isSystemAdmin = true;
        return next();
      }

      let targetWorkspaceId;

      if (req.body && req.body.fromWorkspaceId) {
        targetWorkspaceId = req.body.fromWorkspaceId;
      } else if (req.params.requestId) {
        const request = await CollaborationRequest.findById(
          req.params.requestId
        );
        if (!request) {
          return res.status(404).json({
            success: false,
            message: "Request tidak ditemukan",
          });
        }
        targetWorkspaceId = request.toWorkspace;
        req.collaborationRequest = request;
      } else if (req.params.workspaceId) {
        targetWorkspaceId = req.params.workspaceId;
      } else if (req.query.workspaceId) {
        targetWorkspaceId = req.query.workspaceId;
      }

      if (!targetWorkspaceId) {
        return res.status(400).json({
          success: false,
          message: "Division ID not found ",
        });
      }

      const workspace = await Workspace.findById(targetWorkspaceId);
      if (!workspace) {
        return res.status(404).json({
          success: false,
          message: "Division not found",
        });
      }

      if (workspace.owner.toString() === userId.toString()) {
        req.userWorkspaceRole = "admin";
        req.workspace = workspace;
        return next();
      }

      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this division",
        });
      }

      req.userWorkspaceRole = member.role;
      req.workspace = workspace;

      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message: `This action requires a role: ${allowedRoles.join(
            " or "
          )}. Your role is: ${member.role}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify division role",
        error: error.message,
      });
    }
  };
}
export function checkTaskTypeAccess() {
  return async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const userId = req.user._id;
      if (req.user.isSystemAdmin === true) {
        return next();
      }
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }
      const group = await Group.findById(task.groups);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: "Group not found",
        });
      }
      const project = await Project.findById(group.project).populate(
        "workspace"
      );
      if (!project || !project.workspace) {
        return res.status(404).json({
          success: false,
          message: "Project or Division not found",
        });
      }
      const workspace = project.workspace;
      if (workspace.owner.toString() === userId.toString()) {
        return next();
      }
      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );
      if (!member) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this division",
        });
      }
      const taskType = task.type || "Major";
      const userRole = member.role;
      if (!canAccessTaskType(userRole, taskType, 'edit')) {
        const allowedEditTypes = getAllowedTaskTypes(userRole, 'edit');
        const allowedViewTypes = getAllowedTaskTypes(userRole, 'view');
        
        return res.status(403).json({
          message: `Role "${userRole}" cannot edit task with type "${taskType}". Only can edit: ${allowedEditTypes.join(", ")}`,
        });
      }
      req.task = task;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify task type access",
        error: error.message,
      });
    }
  };
}

export function checkSubtaskTypeAccess() {
  return async (req, res, next) => {
    try {
      const { subTaskId } = req.params;
      const userId = req.user._id;
      
      if (req.user.isSystemAdmin === true) {
        return next();
      }
      const subtask = await Subtask.findById(subTaskId).populate('task');
      if (!subtask || !subtask.task) {
        return res.status(404).json({
          success: false,
          message: "Subtask or parent task not found",
        });
      }
      
      const task = subtask.task;
      const group = await Group.findById(task.groups);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: "Group not found",
        });
      }
      
      const project = await Project.findById(group.project).populate('workspace');
      if (!project || !project.workspace) {
        return res.status(404).json({
          success: false,
          message: "Project or Division not found",
        });
      }
      
      const workspace = project.workspace;
      if (workspace.owner.toString() === userId.toString()) {
        return next();
      }
      
      const member = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );
      if (!member) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this division",
        });
      }
      
      const taskType = subtask.type || "Major";
      const userRole = member.role;
      
      if (!canAccessTaskType(userRole, taskType, 'edit')) {
        const allowedEditTypes = getAllowedTaskTypes(userRole, 'edit');
        const allowedViewTypes = getAllowedTaskTypes(userRole, 'view');
        
        return res.status(403).json({
          message: `Role "${userRole}" cannot edit task with type "${taskType}". Only can edit: ${allowedEditTypes.join(", ")}`,        });
      }
      
      req.task = task;
      req.subtask = subtask;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify subtask type access",
        error: error.message,
      });
    }
  };
}
