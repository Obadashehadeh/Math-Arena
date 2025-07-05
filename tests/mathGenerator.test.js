const { generateMathEquation, validateAnswer, DIFFICULTIES } = require('../shared/utils/mathGenerator');

describe('Math Generator', () => {
    describe('generateMathEquation', () => {
        it('should generate equation for difficulty 1', () => {
            const equation = generateMathEquation(1);
            expect(equation).toHaveProperty('equation');
            expect(equation).toHaveProperty('answer');
            expect(equation.difficulty).toBe(1);
        });

        it('should generate equation for difficulty 4', () => {
            const equation = generateMathEquation(4);
            expect(equation).toHaveProperty('equation');
            expect(equation).toHaveProperty('answer');
            expect(equation.difficulty).toBe(4);
        });

        it('should throw error for invalid difficulty', () => {
            expect(() => generateMathEquation(5)).toThrow('Invalid difficulty level');
        });
    });

    describe('validateAnswer', () => {
        it('should validate correct answer', () => {
            expect(validateAnswer(42, 42)).toBe(true);
            expect(validateAnswer(42.01, 42)).toBe(true); // Within tolerance
        });

        it('should reject incorrect answer', () => {
            expect(validateAnswer(40, 42)).toBe(false);
            expect(validateAnswer('invalid', 42)).toBe(false);
        });
    });
});