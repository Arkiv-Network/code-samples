import { transformPOJOToKeyValuePairs, transformAnnotationsToPOJO, transformListPOJOToAnnotations, transformAnnotationsToListPOJO } from './index';

describe('Annotation Transformers', () => {

	it('should correctly transform a POJO to annotations and back to the original POJO - true/false go to strings', () => {
		// 1. Define the original object
		const originalObject = {
			name: "Test Item",
			value: 99,
			id: "xyz-123",
			isValid: true
		};

		// 2. Perform the round-trip transformation
		const annotations = transformPOJOToKeyValuePairs(originalObject);
		const reconstructedObject = transformAnnotationsToPOJO(annotations, false);

		// 3. Define what you expect the object to look like after the round-trip
		// Your current functions only handle strings and numbers.
		const expectedObject = {
			name: "Test Item",
			value: 99,
			id: "xyz-123",
			isValid: "true" // Notice this one remains a string.
		};

		// 4. Use .toEqual() to compare the result with the expected object
		expect(reconstructedObject).toEqual(expectedObject);
	});

	it('should correctly transform a POJO to annotations and back to the original POJO', () => {
		// 1. Define the original object
		const originalObject = {
			name: "Test Item",
			value: 99,
			id: "xyz-123",
			isValid: true,
			doSomething: false
		};

		// 2. Perform the round-trip transformation
		const annotations = transformPOJOToKeyValuePairs(originalObject);
		const reconstructedObject = transformAnnotationsToPOJO(annotations, true); // True means convert "true" and "false" to true and false respectively.

		// 3. Define what you expect the object to look like after the round-trip
		// Your current functions only handle strings and numbers.
		const expectedObject = {
			name: "Test Item",
			value: 99,
			id: "xyz-123",
			isValid: true, // Now it's back to bool.
			doSomething: false
		};

		// 4. Use .toEqual() to compare the result with the expected object
		expect(reconstructedObject).toEqual(expectedObject);
	});


	describe('List Annotation Transformers', () => {
		// Define the initial object to be used in all tests.
		// The order is intentionally not sorted.
		const initialObject = {
			people: ['Zoe', 'Adam', 'Charlie'],
			scores: [100, 1, 50],
			active: [true, false],
		};

		test('should sort, convert booleans, and transform back correctly (default behavior)', () => {
			// This is the expected result when everything is sorted.
			const expectedObject = {
				people: ['Adam', 'Charlie', 'Zoe'], // sorted alphabetically
				scores: [1, 50, 100], // sorted numerically
				active: [false, true], // sorted (false then true)
			};

			// Use default parameters: sort=true, convertBools=true
			const annotations = transformListPOJOToAnnotations(initialObject);
			const reconstructedObject = transformAnnotationsToListPOJO(annotations);

			expect(reconstructedObject).toEqual(expectedObject);
		});

		test('should preserve order, convert booleans, and transform back correctly', () => {
			// The expected object is the same as the initial one since we are not sorting.
			const expectedObject = {
				people: ['Zoe', 'Adam', 'Charlie'],
				scores: [100, 1, 50],
				active: [true, false],
			};

			// Set sort to false for both functions.
			const annotations = transformListPOJOToAnnotations(initialObject, false);
			const reconstructedObject = transformAnnotationsToListPOJO(annotations, true, false);

			expect(reconstructedObject).toEqual(expectedObject);
		});

		test('should sort, NOT convert booleans, and transform back correctly', () => {
			// The expected object has sorted arrays, but booleans remain as strings.
			const expectedObject = {
				people: ['Adam', 'Charlie', 'Zoe'],
				scores: [1, 50, 100],
				active: ['false', 'true'], // Note: these are sorted strings, not booleans
			};

			// Set convertBools to false.
			const annotations = transformListPOJOToAnnotations(initialObject, true);
			const reconstructedObject = transformAnnotationsToListPOJO(annotations, false, true);

			expect(reconstructedObject).toEqual(expectedObject);
		});

		test('should preserve order, NOT convert booleans, and transform back correctly', () => {
			// The expected object has the original order, and booleans remain as strings.
			const expectedObject = {
				people: ['Zoe', 'Adam', 'Charlie'],
				scores: [100, 1, 50],
				active: ['true', 'false'], // Note: these are strings in the original order
			};

			// Set both sort and convertBools to false.
			const annotations = transformListPOJOToAnnotations(initialObject, false);
			const reconstructedObject = transformAnnotationsToListPOJO(annotations, false, false);

			expect(reconstructedObject).toEqual(expectedObject);
		});
	});

});
