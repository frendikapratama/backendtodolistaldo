import Task from "../models/Task.js";
import { handleError } from "../utils/errorHandler.js";
import Group from "../models/Group.js";
import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";
import Kuarter from "../models/Kuarter.js";

export async function getProgresByProject(req, res) {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project tidak ditemukan",
      });
    }

    // 1. Ambil grup berdasarkan project
    const groups = await Group.find({ project: projectId });
    const groupIds = groups.map((g) => g._id);

    // 2. Ambil task berdasarkan grup
    const tasks = await Task.find({ groups: { $in: groupIds } });

    // Jika project tidak punya grup atau task
    if (groups.length === 0) {
      return res.json({
        success: true,
        progress: 0,
        groups: [],
        totalTask: 0,
      });
    }

    let totalTaskProject = 0;
    let weightedProgressSum = 0;

    const groupProgressList = [];

    for (let group of groups) {
      const tasksInGroup = tasks.filter(
        (t) => String(t.groups) === String(group._id)
      );

      const totalTaskGroup = tasksInGroup.length;
      const doneTaskGroup = tasksInGroup.filter(
        (t) => t.status === "Done"
      ).length;

      const progressGroup =
        totalTaskGroup === 0 ? 0 : (doneTaskGroup / totalTaskGroup) * 100;

      // simpan untuk detail response
      groupProgressList.push({
        groupId: group._id,
        groupName: group.name,
        progress: Math.round(progressGroup),
        totalTask: totalTaskGroup,
        done: doneTaskGroup,
      });

      // akumulasi weighted
      totalTaskProject += totalTaskGroup;
      weightedProgressSum += progressGroup * totalTaskGroup;
    }

    // 3. Hitung progress project dari rata-rata weighted grup
    const finalProgress =
      totalTaskProject === 0 ? 0 : weightedProgressSum / totalTaskProject;

    res.json({
      success: true,
      progress: Math.round(finalProgress),
      totalTask: totalTaskProject,
      groups: groupProgressList,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProgresByGroup(req, res) {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group tidak ditemukan",
      });
    }

    const tasks = await Task.find({ groups: groupId });

    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Done").length;
    const to_do = tasks.filter((t) => t.status === "To Do").length;
    const Hold = tasks.filter((t) => t.status === "Hold").length;
    const reject = tasks.filter((t) => t.status === "Reject").length;
    const in_progress = tasks.filter((t) => t.status === "In Progress").length;
    const progress = total === 0 ? 0 : (done / total) * 100;

    res.json({
      success: true,
      data: {
        groupId: group._id,
        groupName: group.nama,
        groupDescription: group.description,
        progress: Math.round(progress),
        totalTask: total,
        done,
        in_progress,
        to_do,
        Hold,
        reject,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProgresByWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;
    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        message: "Workspace tidak ditemukan",
      });
    }

    const projects = await Project.find({
      $or: [{ workspace: workspaceId }, { otherWorkspaces: workspaceId }],
    });

    const totalProject = projects.length;

    if (totalProject === 0) {
      return res.json({
        success: true,
        data: {
          workspaceId,
          totalProject: 0,
          completedProject: 0,
          inProgressProject: 0,
          planningProject: 0,
          undatedProject: 0,
          undatedTask: 0,
          progress: 0,
          projects: [],
        },
      });
    }

    const projectIds = projects.map((p) => p._id);
    const groups = await Group.find({ project: { $in: projectIds } });

    // Hitung undated task dari semua task di workspace
    const allGroupIds = groups.map((g) => g._id);
    const allTasks = await Task.find({ groups: { $in: allGroupIds } });

    // const undatedTask = allTasks.filter(
    //   (t) => !t.due_date || t.due_date === null
    // ).length;

    const totalGroup = groups.length;

    const projectsProgress = await Promise.all(
      projects.map(async (project) => {
        const projectGroupIds = groups
          .filter((g) => g.project.toString() === project._id.toString())
          .map((g) => g._id);

        const projectTasks = await Task.find({
          groups: { $in: projectGroupIds },
        });

        const totalTask = projectTasks.length;
        const completedTask = projectTasks.filter(
          (t) => t.status === "Done"
        ).length;

        // Cek apakah semua task dalam project adalah status "To Do" dengan note "Planning"
        const allTasksPlanning =
          totalTask > 0 &&
          projectTasks.every(
            (t) =>
              t.status === "To Do" &&
              (t.note === "Planning" || t.note === "Uncomplete")
          );

        // Cek apakah semua task dalam project adalah status "Hold" atau "Blocked" dengan note "Planning"
        const allTasksUndated =
          totalTask > 0 &&
          projectTasks.every(
            (t) =>
              (t.status === "Hold" || t.status === "Blocked") &&
              (t.note === "Planning" || t.note === "Uncomplete")
          );

        const percent =
          totalTask === 0 ? 0 : Math.round((completedTask / totalTask) * 100);

        const isOwned = project.workspace.toString() === workspaceId;

        return {
          projectId: project._id,
          projectName: project.nama,
          totalTask,
          completedTask,
          progress: percent,
          isCompleted: percent === 100,
          isPlanning: allTasksPlanning,
          isUndated: allTasksUndated,
          projectType: isOwned ? "owned" : "collaborated",
        };
      })
    );

    // Hitung project berdasarkan status
    const completedProject = projectsProgress.filter(
      (p) => p.isCompleted
    ).length;

    const planningProject = projectsProgress.filter((p) => p.isPlanning).length;

    const undatedProject = projectsProgress.filter((p) => p.isUndated).length;

    const inProgressProject = projectsProgress.filter(
      (p) => !p.isPlanning && !p.isUndated && p.progress > 0 && p.progress < 100
    ).length;

    const notStartedProject = projectsProgress.filter(
      (p) => !p.isPlanning && !p.isUndated && p.progress === 0
    ).length;

    // Hitung progres workspace dengan rata-rata progres semua project
    const totalProgress = projectsProgress.reduce(
      (sum, project) => sum + project.progress,
      0
    );
    const workspaceProgress = Math.round(totalProgress / totalProject);

    res.json({
      success: true,
      data: {
        workspaceId,
        totalProject,
        completedProject,
        inProgressProject,
        notStartedProject,
        planned: planningProject,
        undatedProject,
        totalGroup,
        // undatedTask,
        progress: workspaceProgress,
        projects: projectsProgress,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// export async function getProgresByKuarter(req, res) {
//   try {
//     const { kuarterId } = req.params;

//     const kuarter = await Kuarter.findById(kuarterId);
//     if (!kuarter) {
//       return res.status(404).json({
//         success: false,
//         message: "Kuarter tidak ditemukan",
//       });
//     }

//     const workspaces = await Workspace.find({ kuarter: kuarterId });
//     const totalWorkspace = workspaces.length;

//     // Jika kosong, return 0 semua
//     if (totalWorkspace === 0) {
//       return res.json({
//         success: true,
//         data: {
//           kuarterId: kuarter._id,
//           kuarterName: kuarter.nama,
//           departemen: kuarter.departemen,
//           totalWorkspace: 0,
//           totalProject: 0,
//           completedProject: 0,
//           inProgressProject: 0,
//           planningProject: 0,
//           undatedProject: 0,
//           notStartedProject: 0,
//           overdueProject: 0,
//           undatedTask: 0,
//           progress: 0,
//           workspaces: [],
//         },
//       });
//     }

//     const workspaceIds = workspaces.map((w) => w._id);

//     // Ambil seluruh project di kuarter ini
//     const allProjects = await Project.find({
//       $or: [
//         { workspace: { $in: workspaceIds } },
//         { otherWorkspaces: { $in: workspaceIds } },
//       ],
//     });

//     const projectIds = allProjects.map((p) => p._id);

//     const allGroups = await Group.find({ project: { $in: projectIds } });
//     const allGroupIds = allGroups.map((g) => g._id);

//     const allTasks = await Task.find({ groups: { $in: allGroupIds } });

//     // ============================================================
//     // HITUNG STATUS PROJECT (SESUAI getProgresByWorkspace)
//     // TERMASUK overdueProject (Completed - Overdue)
//     // ============================================================
//     const projectsStatus = allProjects.map((project) => {
//       const projectGroupIds = allGroups
//         .filter((g) => g.project.toString() === project._id.toString())
//         .map((g) => g._id);

//       const projectTasks = allTasks.filter((t) =>
//         projectGroupIds.some((gid) => gid.toString() === t.groups.toString())
//       );

//       const totalTask = projectTasks.length;
//       const completedTask = projectTasks.filter(
//         (t) => t.status === "Done"
//       ).length;

//       const percent =
//         totalTask === 0 ? 0 : Math.round((completedTask / totalTask) * 100);

//       const allPlanning =
//         totalTask > 0 &&
//         projectTasks.every(
//           (t) =>
//             t.status === "To Do" &&
//             (t.note === "Planning" || t.note === "Uncomplete")
//         );

//       const allUndated =
//         totalTask > 0 &&
//         projectTasks.every(
//           (t) =>
//             (t.status === "Hold" || t.status === "Blocked") &&
//             (t.note === "Planning" || t.note === "Uncomplete")
//         );

//       const undatedTask = projectTasks.filter(
//         (t) => !t.due_date || t.due_date === null
//       ).length;

//       // ============= ADD: CHECK PROJECT TERLAMBAT =============
//       const isOverdue = projectTasks.some(
//         (t) => t.status === "Done" && t.note === "Completed - Overdue"
//       );

//       return {
//         projectId: project._id,
//         projectName: project.nama,

//         progress: percent,
//         totalTask,
//         completedTask,
//         undatedTask,

//         isCompleted: percent === 100,
//         isPlanning: allPlanning,
//         isUndated: allUndated,
//         isInProgress:
//           percent > 0 && percent < 100 && !allPlanning && !allUndated,
//         isNotStarted: percent === 0 && !allPlanning && !allUndated,

//         // ADD:
//         isOverdue,
//       };
//     });

//     // ============================================================
//     // SUMMARY PROJECT KUARTER
//     // ============================================================
//     const completedProject = projectsStatus.filter((p) => p.isCompleted).length;
//     const planningProject = projectsStatus.filter((p) => p.isPlanning).length;
//     const undatedProject = projectsStatus.filter((p) => p.isUndated).length;
//     const inProgressProject = projectsStatus.filter(
//       (p) => p.isInProgress
//     ).length;
//     const notStartedProject = projectsStatus.filter(
//       (p) => p.isNotStarted
//     ).length;

//     // ADD: total project terlambat
//     const overdueProject = projectsStatus.filter((p) => p.isOverdue).length;

//     const totalUndatedTask = projectsStatus.reduce(
//       (sum, p) => sum + p.undatedTask,
//       0
//     );

//     // ============================================================
//     // HITUNG PROGRES PER WORKSPACE
//     // ============================================================
//     const workspacesProgress = await Promise.all(
//       workspaces.map(async (workspace) => {
//         const workspaceProjects = allProjects.filter(
//           (p) =>
//             p.workspace.toString() === workspace._id.toString() ||
//             (p.otherWorkspaces &&
//               p.otherWorkspaces.some(
//                 (ow) => ow.toString() === workspace._id.toString()
//               ))
//         );

//         const projectProgressList = workspaceProjects.map((project) => {
//           const projState = projectsStatus.find(
//             (ps) => ps.projectId.toString() === project._id.toString()
//           );
//           return projState ? projState.progress : 0;
//         });

//         const workspaceProgress =
//           projectProgressList.length === 0
//             ? 0
//             : Math.round(
//                 projectProgressList.reduce((a, b) => a + b, 0) /
//                   projectProgressList.length
//               );

//         return {
//           workspaceId: workspace._id,
//           workspaceName: workspace.nama,
//           totalProject: workspaceProjects.length,
//           progress: workspaceProgress,
//         };
//       })
//     );

//     // ============================================================
//     // FINAL: PROGRESS KUARTER
//     // ============================================================
//     const totalWorkspaceProgress = workspacesProgress.reduce(
//       (sum, ws) => sum + ws.progress,
//       0
//     );

//     const kuarterProgress =
//       totalWorkspace === 0
//         ? 0
//         : Math.round(totalWorkspaceProgress / totalWorkspace);

//     // ============================================================
//     // RESPONSE
//     // ============================================================
//     res.json({
//       success: true,
//       data: {
//         kuarterId: kuarter._id,
//         kuarterName: kuarter.nama,
//         departemen: kuarter.departemen,

//         totalWorkspace,
//         totalProject: allProjects.length,

//         completedProject,
//         inProgressProject,
//         planningProject,
//         undatedProject,
//         notStartedProject,
//         overdueProject, // ✔ Tambahan
//         undatedTask: totalUndatedTask,

//         progress: kuarterProgress,
//         workspaces: workspacesProgress,
//       },
//     });
//   } catch (error) {
//     return handleError(res, error);
//   }
// }

export async function getProgresByKuarter(req, res) {
  try {
    const { kuarterId } = req.params;

    const kuarter = await Kuarter.findById(kuarterId);
    if (!kuarter) {
      return res.status(404).json({
        success: false,
        message: "Kuarter tidak ditemukan",
      });
    }

    const workspaces = await Workspace.find({ kuarter: kuarterId });
    const totalWorkspace = workspaces.length;

    // Jika kosong, return 0 semua
    if (totalWorkspace === 0) {
      return res.json({
        success: true,
        data: {
          kuarterId: kuarter._id,
          kuarterName: kuarter.nama,
          departemen: kuarter.departemen,
          totalWorkspace: 0,
          totalTask: 0,
          doneTask: 0,
          inProgressTask: 0,
          blockedTask: 0,
          holdTask: 0,
          planningTask: 0,
          progress: 0,
          workspaces: [],
        },
      });
    }

    const workspaceIds = workspaces.map((w) => w._id);

    const allProjects = await Project.find({
      $or: [
        { workspace: { $in: workspaceIds } },
        { otherWorkspaces: { $in: workspaceIds } },
      ],
    });

    const projectIds = allProjects.map((p) => p._id);

    // Ambil semua groups dari semua project
    const allGroups = await Group.find({ project: { $in: projectIds } });
    const allGroupIds = allGroups.map((g) => g._id);

    // Ambil semua tasks dari semua groups
    const allTasks = await Task.find({ groups: { $in: allGroupIds } }).lean();

    const totalTask = allTasks.length;
    const totalProject = allProjects.length;

    // Jika tidak ada task, return 0 semua
    if (totalTask === 0) {
      return res.json({
        success: true,
        data: {
          kuarterId: kuarter._id,
          kuarterName: kuarter.nama,
          departemen: kuarter.departemen,

          totalWorkspace,
          totalTask: 0,
          doneTask: 0,
          inProgressTask: 0,
          blockedTask: 0,
          holdTask: 0,
          planningTask: 0,
          progress: 0,
          workspaces: workspaces.map((ws) => ({
            workspaceId: ws._id,
            workspaceName: ws.nama,
            totalTask: 0,
            progress: 0,
            doneTask: 0,
            inProgressTask: 0,
            blockedTask: 0,
            holdTask: 0,
            planningTask: 0,
          })),
        },
      });
    }

    // ============================================================
    // HITUNG STATUS SETIAP TASK
    // ============================================================
    const taskStatusList = allTasks.map((task) => {
      // Tentukan kategori status berdasarkan status task
      let statusCategory = "";

      switch (task.status) {
        case "Done":
          statusCategory = "done";
          break;
        case "In Progress":
          statusCategory = "inProgress";
          break;
        case "Blocked":
          statusCategory = "blocked";
          break;
        case "Hold":
          statusCategory = "hold";
          break;
        case "To Do":
        case "Not Started":
          statusCategory = "planning";
          break;
        default:
          statusCategory = "planning";
      }

      return {
        taskId: task._id,
        taskName: task.nama,
        status: task.status,
        statusCategory,
        isDone: task.status === "Done",
        workspaceId: null,
      };
    });

    // ============================================================
    // MAPPING TASK KE WORKSPACE
    // ============================================================
    const groupWorkspaceMap = {};

    for (const group of allGroups) {
      const project = allProjects.find(
        (p) => p._id.toString() === group.project.toString()
      );
      if (project) {
        const mainWorkspace = workspaces.find(
          (w) => w._id.toString() === project.workspace.toString()
        );
        if (mainWorkspace) {
          groupWorkspaceMap[group._id.toString()] =
            mainWorkspace._id.toString();
        }

        if (project.otherWorkspaces && project.otherWorkspaces.length > 0) {
          project.otherWorkspaces.forEach((wsId) => {
            const otherWorkspace = workspaces.find(
              (w) => w._id.toString() === wsId.toString()
            );
            if (otherWorkspace) {
              groupWorkspaceMap[group._id.toString()] =
                otherWorkspace._id.toString();
            }
          });
        }
      }
    }

    // Update workspaceId pada setiap task
    taskStatusList.forEach((taskStatus) => {
      const task = allTasks.find(
        (t) => t._id.toString() === taskStatus.taskId.toString()
      );
      if (task && task.groups && task.groups.length > 0) {
        const groupsArray = Array.isArray(task.groups)
          ? task.groups
          : [task.groups];

        const workspaceIds = [];
        groupsArray.forEach((groupId) => {
          const wsId = groupWorkspaceMap[groupId.toString()];
          if (wsId && !workspaceIds.includes(wsId)) {
            workspaceIds.push(wsId);
          }
        });

        taskStatus.workspaceId =
          workspaceIds.length > 0 ? workspaceIds[0] : null;
      }
    });

    // ============================================================
    // SUMMARY TASK PER KUARTER
    // ============================================================
    const doneTask = taskStatusList.filter(
      (t) => t.statusCategory === "done"
    ).length;
    const inProgressTask = taskStatusList.filter(
      (t) => t.statusCategory === "inProgress"
    ).length;
    const blockedTask = taskStatusList.filter(
      (t) => t.statusCategory === "blocked"
    ).length;
    const holdTask = taskStatusList.filter(
      (t) => t.statusCategory === "hold"
    ).length;
    const planningTask = taskStatusList.filter(
      (t) => t.statusCategory === "planning"
    ).length;

    // Hitung progress: hanya dari task yang Done
    const progress =
      totalTask === 0 ? 0 : Math.round((doneTask / totalTask) * 100);

    // ============================================================
    // HITUNG PROGRESS PER WORKSPACE BERDASARKAN TASK YANG DONE
    // ============================================================
    const workspacesProgress = await Promise.all(
      workspaces.map(async (workspace) => {
        // Filter task yang termasuk dalam workspace ini
        const workspaceTasks = taskStatusList.filter(
          (t) =>
            t.workspaceId &&
            t.workspaceId.toString() === workspace._id.toString()
        );

        const totalWsTask = workspaceTasks.length;

        if (totalWsTask === 0) {
          return {
            workspaceId: workspace._id,
            workspaceName: workspace.nama,
            totalTask: 0,
            progress: 0,
            doneTask: 0,
            inProgressTask: 0,
            blockedTask: 0,
            holdTask: 0,
            planningTask: 0,
          };
        }

        // Hitung jumlah task per status untuk workspace ini
        const wsDoneTask = workspaceTasks.filter(
          (t) => t.statusCategory === "done"
        ).length;
        const wsInProgressTask = workspaceTasks.filter(
          (t) => t.statusCategory === "inProgress"
        ).length;
        const wsBlockedTask = workspaceTasks.filter(
          (t) => t.statusCategory === "blocked"
        ).length;
        const wsHoldTask = workspaceTasks.filter(
          (t) => t.statusCategory === "hold"
        ).length;
        const wsPlanningTask = workspaceTasks.filter(
          (t) => t.statusCategory === "planning"
        ).length;

        // Hitung progress workspace: hanya dari task yang Done
        const wsProgress =
          totalWsTask === 0 ? 0 : Math.round((wsDoneTask / totalWsTask) * 100);

        return {
          workspaceId: workspace._id,
          workspaceName: workspace.nama,
          totalTask: totalWsTask,
          progress: wsProgress,
          doneTask: wsDoneTask,
          inProgressTask: wsInProgressTask,
          blockedTask: wsBlockedTask,
          holdTask: wsHoldTask,
          planningTask: wsPlanningTask,
        };
      })
    );

    // ============================================================
    // RESPONSE
    // ============================================================
    res.json({
      success: true,
      data: {
        kuarterId: kuarter._id,
        kuarterName: kuarter.nama,
        departemen: kuarter.departemen,
        totalProject,
        totalWorkspace,
        totalTask,

        doneTask,
        inProgressTask,
        blockedTask, // Blocked terpisah
        holdTask, // Hold terpisah
        planningTask, // Planning

        progress, // Progress hanya dihitung dari task yang Done
        workspaces: workspacesProgress,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAllKuarterWithProgress(req, res) {
  try {
    // Ambil semua kuarter
    const kuarters = await Kuarter.find();

    if (kuarters.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Hitung progress untuk setiap kuarter
    const kuartersWithProgress = await Promise.all(
      kuarters.map(async (kuarter) => {
        const workspaces = await Workspace.find({ kuarter: kuarter._id });
        const totalWorkspace = workspaces.length;

        // Jika tidak ada workspace, progress = 0
        if (totalWorkspace === 0) {
          return {
            kuarterId: kuarter._id,
            kuarterName: kuarter.nama,
            departemen: kuarter.departemen,
            progress: 0,
            totalWorkspace: 0,
          };
        }

        const workspaceIds = workspaces.map((w) => w._id);

        // Ambil seluruh project di kuarter ini
        const allProjects = await Project.find({
          $or: [
            { workspace: { $in: workspaceIds } },
            { otherWorkspaces: { $in: workspaceIds } },
          ],
        });

        if (allProjects.length === 0) {
          return {
            kuarterId: kuarter._id,
            kuarterName: kuarter.nama,
            departemen: kuarter.departemen,
            progress: 0,
            totalWorkspace,
          };
        }

        const projectIds = allProjects.map((p) => p._id);
        const allGroups = await Group.find({ project: { $in: projectIds } });
        const allGroupIds = allGroups.map((g) => g._id);
        const allTasks = await Task.find({ groups: { $in: allGroupIds } });

        // Hitung progress per workspace
        const workspacesProgress = await Promise.all(
          workspaces.map(async (workspace) => {
            const workspaceProjects = allProjects.filter(
              (p) =>
                p.workspace.toString() === workspace._id.toString() ||
                (p.otherWorkspaces &&
                  p.otherWorkspaces.some(
                    (ow) => ow.toString() === workspace._id.toString()
                  ))
            );

            const projectProgressList = workspaceProjects.map((project) => {
              const projectGroupIds = allGroups
                .filter((g) => g.project.toString() === project._id.toString())
                .map((g) => g._id);

              const projectTasks = allTasks.filter((t) =>
                projectGroupIds.some(
                  (gid) => gid.toString() === t.groups.toString()
                )
              );

              const totalTask = projectTasks.length;
              const completedTask = projectTasks.filter(
                (t) => t.status === "Done"
              ).length;

              return totalTask === 0
                ? 0
                : Math.round((completedTask / totalTask) * 100);
            });

            return projectProgressList.length === 0
              ? 0
              : Math.round(
                  projectProgressList.reduce((a, b) => a + b, 0) /
                    projectProgressList.length
                );
          })
        );

        // Hitung progress kuarter dari rata-rata workspace
        const totalWorkspaceProgress = workspacesProgress.reduce(
          (sum, ws) => sum + ws,
          0
        );
        const kuarterProgress = Math.round(
          totalWorkspaceProgress / totalWorkspace
        );

        return {
          kuarterId: kuarter._id,
          kuarterName: kuarter.nama,
          departemen: kuarter.departemen,
          progress: kuarterProgress,
          totalWorkspace,
        };
      })
    );

    res.json({
      success: true,
      data: kuartersWithProgress,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
