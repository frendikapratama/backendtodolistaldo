import Group from "../models/Group.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { handleError } from "../utils/errorHandler.js";
import { createActivity } from "../helpers/activityhelper.js";
export async function getGroup(req, res) {
  try {
    const data = await Group.find().populate("task", "nama");
    res.status(200).json(data);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateGroupPositions(req, res) {
  try {
    const { projectId } = req.params;
    const { groupIds } = req.body;

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "groupIds harus berupa array dan tidak boleh kosong",
      });
    }

    const groupsInProject = await Group.find({
      _id: { $in: groupIds },
      project: projectId,
    });

    if (groupsInProject.length !== groupIds.length) {
      return res.status(400).json({
        success: false,
        message: "Beberapa group tidak ada di project ini",
      });
    }

    const updatePromises = groupIds.map((id, index) =>
      Group.findByIdAndUpdate(id, { position: index }, { new: true }),
    );

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: "Group positions updated successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGroup(req, res) {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const group = await Group.create({
      nama: "New Group",
      project: projectId,
    });

    project.groups.push(group._id);
    await project.save();

    const populatedGroup = await Group.findById(group._id).populate("task");

    res.status(201).json({
      success: true,
      message: "Group created successfully ",
      data: populatedGroup,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateGroup(req, res) {
  try {
    const { groupId } = req.params;
    const { projectId, ...updateData } = req.body;

    const oldGroup = await Group.findById(groupId);
    if (!oldGroup) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    if (projectId && projectId !== String(oldGroup.project)) {
      await Project.findByIdAndUpdate(oldGroup.project, {
        $pull: { groups: oldGroup._id },
      });
      await Project.findByIdAndUpdate(projectId, {
        $push: { groups: oldGroup._id },
      });
    }

    updateData.project = projectId || oldGroup.project;

    const updatedGroup = await Group.findByIdAndUpdate(groupId, updateData, {
      new: true,
    });

    const before = {};
    const after = {};

    for (const key in updateData) {
      const oldValue = oldGroup[key];
      const newValue = updateData[key];

      if (String(oldValue) !== String(newValue)) {
        before[key] = oldValue;
        after[key] = newValue;
      }
    }

    if (Object.keys(before).length > 0) {
      const project = await Project.findById(updatedGroup.project);

      await createActivity({
        user: req.user._id,
        workspace: project.workspace,
        project: updatedGroup.project,
        group: groupId,
        action: "UPDATE_GROUP",
        description: `User mengupdate group "${updatedGroup.nama}"`,
        before,
        after,
      });
    }

    res.status(200).json({
      success: true,
      message: "Group updated successfully",
      data: updatedGroup,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteGroup(req, res) {
  try {
    const { groupId } = req.params;
    const groupRef = await Group.findById(groupId).select("project");

    if (!groupRef) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    await Task.deleteMany({ groups: groupId });

    await Project.findByIdAndUpdate(groupRef.project, {
      $pull: { groups: groupId },
    });
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
