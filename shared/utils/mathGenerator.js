// Math equation generator based on difficulty levels
const DIFFICULTIES = {
    1: { operands: 2, digits: 1, operations: ['+', '-', '*', '/'] },
    2: { operands: 3, digits: 2, operations: ['+', '-', '*', '/'] },
    3: { operands: 4, digits: 3, operations: ['+', '-', '*', '/'] },
    4: { operands: 5, digits: 4, operations: ['+', '-', '*', '/'] }
};

const generateRandomNumber = (digits) => {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomOperation = (operations) => {
    return operations[Math.floor(Math.random() * operations.length)];
};

const evaluateExpression = (expression) => {
    // Safe evaluation of mathematical expressions
    try {
        // Remove spaces and validate expression contains only numbers and operators
        const cleanExpression = expression.replace(/\s/g, '');
        if (!/^[\d+\-*/.() ]+$/.test(cleanExpression)) {
            throw new Error('Invalid expression');
        }

        // Use Function constructor for safe evaluation (better than eval)
        const result = new Function('return ' + cleanExpression)();
        return Math.round(result * 100) / 100; // Round to 2 decimal places
    } catch (error) {
        throw new Error('Failed to evaluate expression');
    }
};

const generateMathEquation = (difficulty) => {
    if (!DIFFICULTIES[difficulty]) {
        throw new Error('Invalid difficulty level');
    }

    const config = DIFFICULTIES[difficulty];
    const numbers = [];
    const operations = [];

    // Generate random numbers
    for (let i = 0; i < config.operands; i++) {
        numbers.push(generateRandomNumber(config.digits));
    }

    // Generate random operations (one less than operands)
    for (let i = 0; i < config.operands - 1; i++) {
        operations.push(getRandomOperation(config.operations));
    }

    // Build the equation string
    let equation = numbers[0].toString();
    for (let i = 0; i < operations.length; i++) {
        equation += ` ${operations[i]} ${numbers[i + 1]}`;
    }

    // Calculate the answer
    const answer = evaluateExpression(equation);

    return {
        equation,
        answer,
        difficulty,
        createdAt: new Date()
    };
};

const validateAnswer = (userAnswer, correctAnswer, tolerance = 0.01) => {
    const numericUserAnswer = parseFloat(userAnswer);

    if (isNaN(numericUserAnswer)) {
        return false;
    }

    return Math.abs(numericUserAnswer - correctAnswer) <= tolerance;
};

module.exports = {
    generateMathEquation,
    validateAnswer,
    DIFFICULTIES
};