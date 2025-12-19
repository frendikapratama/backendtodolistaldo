// controllers/chatController.js
import ChatMessage from "../models/Chat.js";
import Workspace from "../models/Workspace.js";

// Check if user is workspace member
const isWorkspaceMember = async (userId, workspaceId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return false;

  if (workspace.owner.toString() === userId) return true;

  return workspace.members.some((member) => member.user.toString() === userId);
};

// Get workspace messages
export const getWorkspaceMessages = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Check membership
    const isMember = await isWorkspaceMember(
      req.user._id.toString(),
      workspaceId
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this workspace",
      });
    }

    const messages = await ChatMessage.find({
      workspace: workspaceId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("sender", "username email photo")
      .populate("readBy.user", "username email");

    const total = await ChatMessage.countDocuments({
      workspace: workspaceId,
      isDeleted: false,
    });

    res.status(200).json({
      success: true,
      data: messages.reverse(), // Reverse to show oldest first
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

// Upload chat file
export const uploadChatFile = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Check membership
    const isMember = await isWorkspaceMember(
      req.user._id.toString(),
      workspaceId
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this workspace",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const fileUrl = `/uploads/chat/${req.file.filename}`;
    const fileType = req.file.mimetype.startsWith("image/") ? "image" : "file";

    res.status(200).json({
      success: true,
      data: {
        fileUrl,
        fileName: req.file.originalname,
        fileType,
      },
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload file",
      error: error.message,
    });
  }
};

export const deleteMessage = async (req, res) =>{
  try{
    const { messageId } = req.params;
    const message = await ChatMessage.findById(messageId);
    if(!message){
      return res.status(404).json({
        success: false,
        message: "Message not found"
      })
    }
    if(message.sender.toString() !== req.user._id.toString()){
      return res.status(403).json({
        success: false,
        message: "You are not the sender!"
      })
    }
    message.isDeleted = true,
    message.deletedAt = new Date();
    message.deletedBy = req.user._id;
    await message.save();

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
      data: message
    })
  }
  catch (err){
    res.status(500).json({
      success: false,
      message: "There is an error during deleting message",
      error: err.message
    })
  }
}