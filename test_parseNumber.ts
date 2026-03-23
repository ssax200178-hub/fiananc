import { parseNumber, isValidNumber } from './utils';

const testCases = [
    { input: 123, expected: 123 },
    { input: "123", expected: 123 },
    { input: "12.34", expected: 12.34 },
    { input: "12,34", expected: 12.34 },
    { input: "1,234.56", expected: 1234.56 },
    { input: "1.234,56", expected: 1234.56 }, // European format
    { input: " 123 ", expected: 123 },
    { input: "٢٤٧٥", expected: 2475 },
    { input: "٢,٤٧٥", expected: 2475 },
    { input: "١,٢٣٤.٥٦", expected: 1234.56 },
    { input: null, expected: 0 },
    { input: undefined, expected: 0 },
    { input: "", expected: 0 },
    { input: "abc", expected: NaN },
];

console.log("Running parseNumber tests...");
let passed = 0;
testCases.forEach((tc, index) => {
    const result = parseNumber(tc.input);
    const isNaNResult = isNaN(result);
    const isNaNExpected = isNaN(tc.expected);

    if (result === tc.expected || (isNaNResult && isNaNExpected)) {
        // console.log(`Test ${index + 1} PASSED: input "${tc.input}" -> ${result}`);
        passed++;
    } else {
        console.error(`Test ${index + 1} FAILED: input "${tc.input}" -> expected ${tc.expected}, got ${result}`);
    }
});

console.log(`Passed ${passed} / ${testCases.length} tests.`);

// Test isValidNumber
console.log("\nRunning isValidNumber tests...");
const validCases = [
    { input: 123, expected: true },
    { input: "12.34", expected: true },
    { input: "12,34", expected: true },
    { input: "abc", expected: false },
];

validCases.forEach((tc, index) => {
    const result = isValidNumber(tc.input);
    if (result === tc.expected) {
        // console.log(`ValidTest ${index + 1} PASSED`);
    } else {
        console.error(`ValidTest ${index + 1} FAILED: input "${tc.input}" -> expected ${tc.expected}, got ${result}`);
    }
});
