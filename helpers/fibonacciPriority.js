function factorPIC(piclength) {
    let factorScale;
    switch (true) {
        case (piclength === 1):
            factorScale = 1.0;
            break;
        case (piclength === 2):
            factorScale = 1.1;
            break;
        case (piclength === 3):
            factorScale = 1.25;
            break;
        case (piclength > 3):
            factorScale = 1.4;
            break;
        default:
            factorScale = 1.0;
            break;
    }
    return factorScale;
}

function FiboWeight(userScale) {
    let scaleWeight = 0;
    switch (true) {
        case (userScale > 0 && userScale < 11):
            scaleWeight = 3;
            break;
        case (userScale > 10 && userScale < 26):
            scaleWeight = 5;
            break;
        case (userScale > 25 && userScale < 46):
            scaleWeight = 8;
            break;
        case (userScale > 45 && userScale < 66):
            scaleWeight = 13;
            break;
        case (userScale > 65 && userScale < 86):
            scaleWeight = 21;
            break;
        case (userScale >= 86 && userScale <= 100):
            scaleWeight = 34;
            break;
        default:
            scaleWeight = 0;
            break;
    }
    return scaleWeight;
}
function DayScale(due_date) {
    const today = new Date();
    const todayWIB = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    todayWIB.setHours(0, 0, 0, 0);
    
    const dueDateWIB = new Date(due_date);
    dueDateWIB.setHours(0, 0, 0, 0);
    
    const diffInMs = dueDateWIB - todayWIB;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    let scaleDate = 0;
    
    switch (true) {
        case (diffInDays <= 0):
            scaleDate = 21;
            break;
        case (diffInDays >= 1 && diffInDays <= 2):
            scaleDate = 13;
            break;
        case (diffInDays >= 3 && diffInDays <= 5):
            scaleDate = 8;
            break;
        case (diffInDays >= 6 && diffInDays <= 10):
            scaleDate = 5;
            break;
        case (diffInDays > 10):
            scaleDate = 3;
            break;
        default:
            scaleDate = 3;
            break;
    }
    return scaleDate;
}

/**
 * @param {number} userScale
 * @param {number} piclength 
 * @param {Date} dueDate 
 * @returns {number} 
 */
function calculateFibonacciScore(userScale, piclength, dueDate) {
    // Validate inputs
    if (!userScale || !dueDate) return 0;
    
    const weightScale = FiboWeight(parseInt(userScale));
    const weightDay = DayScale(new Date(dueDate));
    const picFactor = factorPIC(piclength || 0);
    const score = Math.round((weightScale + weightDay) * picFactor);
    
    return score;
}

/**
 * @param {number} score 
 * @returns {Object} { level }
 */
function getPriorityLevelFromScore(score) {
    if (score >= 43) {
        return {
            level: "Urgent"
        };
    } else if (score >= 25 && score <= 42) {
        return {
            level: "High"
        };
    } else if (score >= 12 && score <= 24) {
        return {
            level: "Medium"
        };
    } else {
        return {
            level: "Low"
        };
    }
}

export { calculateFibonacciScore, getPriorityLevelFromScore, FiboWeight, DayScale, factorPIC };