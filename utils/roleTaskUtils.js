
const ROLE_RESTRICTIONS = {
    management: {
        viewTypes: ["Minor", "Major"],  
        editTypes: ["Major"],            
        description: "Can view all types but only edit Major type",
    },
    member: {
        viewTypes: ["Minor", "Major"],
        editTypes: ["Minor", "Major"],
        description: "Can access all types",
    },
    project_manager: {
        viewTypes: ["Minor", "Major"],
        editTypes: ["Minor", "Major"],
        description: "Can access all types",
    },
    admin: {
        viewTypes: ["Minor", "Major"],
        editTypes: ["Minor", "Major"],
        description: "Can access all types",
    },
};

/**
 * @param {String} userRole
 * @param {String} taskType 
 * @param {String} operation
 * @returns {Boolean}
 */
export function canAccessTaskType(userRole, taskType, operation = 'view') {
    const roleConfig = ROLE_RESTRICTIONS[userRole];
    if (!roleConfig) return false;

    const allowedTypes = operation === 'edit' ? roleConfig.editTypes : roleConfig.viewTypes;
    return allowedTypes.includes(taskType);
}

/**
 * @param {String} userRole
 * @param {String} operation 
 * @returns {Array<String>}
 */
export function getAllowedTaskTypes(userRole, operation = 'view') {
    const roleConfig = ROLE_RESTRICTIONS[userRole];
    if (!roleConfig) return [];
    
    return operation === 'edit' ? roleConfig.editTypes : roleConfig.viewTypes;
}

/**
 * @param {Array} tasks
 * @param {String} userRole
 * @returns {Array}
 */
export function filterTasksByRole(tasks, userRole) {
    const allowedTypes = getAllowedTaskTypes(userRole, 'view');
    if (allowedTypes.includes("Minor") && allowedTypes.includes("Major")) {
        return tasks; 
    }
    
    return tasks.filter((task) => allowedTypes.includes(task.type || "Minor"));
}

/**
 * @param {String} userRole 
 * @param {String} taskType 
 * @returns {Object} 
 */
export function canEditTask(userRole, taskType) {
    const canAccess = canAccessTaskType(userRole, taskType, 'edit');
    const editableTypes = getAllowedTaskTypes(userRole, 'edit');
    
    return {
        allowed: canAccess,
        message: canAccess
            ? `Role ${userRole} can edit task with the type ${taskType}`
            : `Role ${userRole} unauthorized to edit ${taskType} type. Only can edit: ${editableTypes.join(", ")}`,
    };
}

/**
 * @param {String} userRole
 * @returns {String}
 */
export function getRoleDescription(userRole) {
    const config = ROLE_RESTRICTIONS[userRole];
    return config ? config.description : "Role Undefined";
}
