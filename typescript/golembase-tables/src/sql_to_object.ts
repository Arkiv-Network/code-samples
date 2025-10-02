import { transformPOJOToAnnotations } from '@freckleface/golembase-js-transformations';
import { GolemBaseCreate, GolemBaseUpdate } from 'golem-base-sdk';
import pkg, { AST, Create } from 'node-sql-parser';
const { Parser } = pkg;
import * as util from 'util';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * TODO: Very early on let's add some form of BSON / binary data so they can upload images and docs.
 *       The SQL Parser allows for a type called BINARY. In that we would store the hash of the entity containing the data.
 * Here are the types the parser recognizes for CREATE TABLE:
 * 
 * Expected "#", "--", ".", "/*", "BIGINT", "BINARY", "BIT", "CHAR", "COLLATE", "DATE", "DATETIME", "DECIMAL", "DOUBLE", 
 * "ENUM", "FLOAT", "GEOMETRY", "GEOMETRYCOLLECTION", "INT", "INTEGER", "JSON", "LINESTRING", "LONGTEXT", "MEDIUMINT", 
 * "MEDIUMTEXT", "MULTILINESTRING", "MULTIPOINT", "MULTIPOLYGON", "NUMERIC", "POINT", "POLYGON", "SET", "SMALLINT", 
 * "TIME", "TIMESTAMP", "TINYINT", "TINYTEXT", "VARBINARY", "VARCHAR", "YEAR", "blob", "boolean", "longblob", 
 * "mediumblob", "tinyblob", or [ \t\n\r] but "T" found.
 */

/* CreateTablerSQLToGBCreate
   NEED TO FIGURE OUT: Should this call to the node? I need to know if the indexer already exists,
   and I'm not sure I should make the caller handle first retreiving the index.
   But that would "step up" this from a passive parser to an active player, reading/writing data.
   THOUGHT: Build a "second level" on top of this which handles that part?
   THOUGHT2: Put indexes in the table schema right here
 *
 * This returns several items:
 *   Either a Create or Update for the table
 *   Either a Create or Update for the (new or updated) index.
 *
 * 
 * It's up to the caller to send it across to a node
*/

// 1. Define the shape of the 'data' object for each SQL type
export type CreateTableData = { type: 'table'; tablename: string; indexes?: string;[key: string]: any; };
export type SelectData = { select: string; tablename: string; where: string; };
export type InsertData = { type: 'tabledata'; tablename: string;[key: string]: any; };

// 2. Create the main discriminated union type for the final result
export type ParseResult =
	| { sqlType: 'create table'; data: CreateTableData | null }
	| { sqlType: 'select'; data: SelectData }
	| { sqlType: 'insert'; data: InsertData };

export type SqlBatches = ParseResult[][];

export const CreateTableObjToGBCreate = (app: string, parseResult: ParseResult): GolemBaseCreate => {

	if (parseResult.sqlType != 'create table' || !parseResult.data) {
		throw new Error("Invalid input: Expected a 'create table' parse result with data.");
	}

	let createTableObj: CreateTableData = { app: app, ...parseResult.data };

	// Create empty index entries, which will get filled in as we add data for this table
	for (let index of createTableObj.indexes?.split(',') || []) {
		createTableObj[`index_${index}`] = '';
	}
	//console.log(createTableObj);

	const create: GolemBaseCreate = {
		data: encoder.encode(`${createTableObj.type} ${createTableObj.tablename}`),
		btl: 100,
		...transformPOJOToAnnotations(createTableObj)
	};

	return create;

}

export const SQLCreateTableToGBCreate = (app: string, createSql: string): GolemBaseCreate => {

	let createTableObj: any = { app: app, ...parseSql(createSql) };

	// Create empty index entries, which will get filled in as we add data for this table
	for (let index of createTableObj.indexes?.split(',') || []) {
		createTableObj[`index_${index}`] = '';
	}
	//console.log(createTableObj);

	const create: GolemBaseCreate = {
		data: encoder.encode(`${createTableObj.type} ${createTableObj.tablename}`),
		btl: 100,
		...transformPOJOToAnnotations(createTableObj)
	};

	return create;
}

export const InsertObjToGBCreate = (app: string, parseResult: ParseResult): GolemBaseCreate => {

	if (parseResult.sqlType != 'insert' || !parseResult.data) {
		throw new Error("Invalid input: Expected an 'insert' parse result with data.");
	}

	let insertObj: InsertData = { app: app, ...parseResult.data };

	insertObj.app = app;

	const create: GolemBaseCreate = {
		data: encoder.encode(`${insertObj.type} ${insertObj.tablename}`),
		btl: 100,
		...transformPOJOToAnnotations(insertObj)
	};

	return create;
}

export const SQLInsertToGBCreate = (app: string, insertSQL: string): GolemBaseCreate => {

	let insertObj: any = { app: app, ...parseSql(insertSQL) };
	//console.log(insertObj);

	const create: GolemBaseCreate = {
		data: encoder.encode(`${insertObj.type} ${insertObj.tablename}`),
		btl: 100,
		...transformPOJOToAnnotations(insertObj)
	};

	return create;
}

/**
 * Filters an object to include only specified keys, plus a set of mandatory keys.
 *
 * @param select A comma-delimited string of keys to include in the result.
 * @param obj The source object to filter.
 * @returns A new object containing only the selected and mandatory keys.
 */
export const filterObjectBySelect = (select: string, obj: Record<string, any>): Record<string, any> => {
	// Get the list of keys to keep from the 'select' string.
	const keysToKeep = select.split(',');

	// Initialize the new object with the three always-included fields.
	const filteredObj: Record<string, any> = {
		app: obj.app,
		type: obj.type,
		tablename: obj.tablename,
	};

	// Iterate over the keys we want to keep.
	for (const key of keysToKeep) {
		// Check if the source object actually has this property before adding it.
		if (obj.hasOwnProperty(key)) {
			filteredObj[key] = obj[key];
		}
	}

	return filteredObj;
}

export interface ParsedForeignKey {
	tablename: string;
	localKey: string;
	viewKey: string;
};
export const parseForeignKeyString = (input: string): { tablename: string; localKey: string; viewKey: string } | null => {
	// Regex to match the pattern and capture the three text parts.
	const fkRegex = /^.*\|FK:(.*):(.*):(.*)$/;

	// Use the .match() method to execute the regex against the input string.
	const match = input.match(fkRegex);

	// If match is null, the string didn't fit the pattern.
	if (!match) {
		return null;
	}

	// The captured groups are in the resulting array at indices 1, 2, and 3.
	// match[0] would be the entire matched string.
	return {
		tablename: match[1],    // The first captured group: 'departments'
		localKey: match[2], // The second captured group: 'dept_id'
		viewKey: match[3],  // The third captured group: 'department_name'
	};
}

// The flattened return type for a single result
type FkQueryResult = {
	queryString: string;
} & ParsedForeignKey;

/**
 * Finds all foreign keys in a POJO and builds a query object for each one.
 *
 * @param pojo The data object to scan for foreign keys.
 * @param fks A map of foreign key metadata.
 * @returns An array of objects, one for each foreign key found.
 */
export const buildFkQueries = (pojo: Record<string, any>, fks: Record<string, ParsedForeignKey>): FkQueryResult[] => {
	// Initialize an empty array to store all the results
	const results: FkQueryResult[] = [];

	for (const [key, value] of Object.entries(pojo)) {
		// Check if the current key from the POJO exists in our FKs map
		if (fks[key]) {
			const fkInfo = fks[key];

			const quote = (val: any) => typeof val === 'string' ? `"${val}"` : val;
			const appClause = `app=${quote(pojo.app)}`;
			const typeClause = `type="tabledata"`;
			const tableClause = `tablename="${fkInfo.tablename}"`;
			const keyClause = `${fkInfo.localKey}=${quote(value)}`;
			const assembledQueryString = `${appClause} && ${typeClause} && ${tableClause} && ${keyClause}`;

			// ✨ Push the new object into the results array instead of returning
			results.push({
				queryString: assembledQueryString,
				...fkInfo
			});
		}
	}

	// Return the array of all found foreign key queries
	return results;
}

/**
 * Groups a list of parsed SQL statements into batches.
 * 'create table' and 'insert' statements are grouped together.
 * 'select' statements are always in their own batch.
 *
 * @param statements An array of ParseResult objects.
 * @returns The statements grouped into batches.
 */
export const groupSqlIntoBatches = (statements: ParseResult[]): SqlBatches => {
	const batches: SqlBatches = [];
	let currentBatch: ParseResult[] = [];

	for (const statement of statements) {
		if (statement.sqlType === 'select') {
			// If the current batch has items, push it to the main list first.
			if (currentBatch.length > 0) {
				batches.push(currentBatch);
			}
			// Reset the current batch.
			currentBatch = [];
			// Push the select statement as its own new batch.
			if (statement.data) {
				batches.push([statement]);
			}
		} else {
			// For 'create table' or 'insert', just add to the current batch.
			if (statement.data) {
				currentBatch.push(statement);
			}
		}
	}

	// After the loop, if there's anything left in the current batch, add it.
	if (currentBatch.length > 0) {
		batches.push(currentBatch);
	}

	return batches;
}

// The main function that dispatches to the correct parser
// ✨ UPDATED: The return type is now 'ParseResult | null'
export const parseSql = (sqlString: string): ParseResult | null => {
	try {
		const parser = new Parser();
		let ast: AST | AST[] = parser.astify(sqlString);

		if (Array.isArray(ast)) {
			ast = ast[0];
		}
		if (!ast) return null;

		// ✨ UPDATED: The switch now returns the standardized object
		switch (ast.type) {
			case 'create':
				return {
					sqlType: 'create table',
					data: parseCreateTable(ast)
				};
			case 'select':
				return {
					sqlType: 'select',
					data: parseSelect(ast)
				};
			case 'insert':
				return {
					sqlType: 'insert',
					data: parseInsert(ast)
				};
			default:
				throw new Error(`Unsupported SQL statement type: ${ast.type}`);
		}
	}
	catch (e) {
		if (e instanceof Error) {
			throw (e.message);
		}
		else {
			throw ('Unknown error');
		}
	}
}

// -----------------------------------------------------------------------------
// CREATE TABLE PARSER
// -----------------------------------------------------------------------------
function parseCreateTable(ast: AST): CreateTableData | null {
	if ((ast as any).keyword !== 'table') return null;
	const typeMap: Record<string, string> = {
		'INTEGER': 'number', 'TEXT': 'string', 'REAL': 'number',
	};
	const result: { [key: string]: any } = {
		type: 'table',
		tablename: (ast as any).table[0].table,
	};
	const indexColumns: string[] = [];
	for (const def of (ast as any).create_definitions) {
		if (def.resource === 'column') {
			const fieldName: string = def.column.column;
			if (fieldName.toLowerCase() === 'tablename' || fieldName.toLowerCase() === 'indexes') {
				throw new Error(`Column name '${fieldName}' is a reserved word and cannot be used.`);
			}
			result[fieldName] = typeMap[def.definition.dataType] || 'unknown';
		}
		else if (def.constraint_type === 'FOREIGN KEY') {
			const localColumn: string = def.definition[0].column;
			if (result[localColumn]) {
				const refTable: string = def.reference_definition.table[0].table;
				const refColumn: string = def.reference_definition.definition[0].column;
				let fkString: string = `|FK:${refTable}:${refColumn}`;
				const constraintName: string | null = def.constraint;
				if (constraintName && constraintName.includes('__view_as__')) {
					const viewColumn = constraintName.split('__view_as__')[1];
					if (viewColumn) fkString += `:${viewColumn}`;
				}
				result[localColumn] += fkString;
			}
		}
		else if (def.resource === 'index') {
			const indexedColumn: string = def.definition[0].column;
			indexColumns.push(indexedColumn);
		}
	}
	if (indexColumns.length > 0) result.indexes = indexColumns.join(',');
	return result as CreateTableData;
}

// -----------------------------------------------------------------------------
// SELECT PARSER
// -----------------------------------------------------------------------------
function parseSelect(ast: AST): SelectData {
	const buildWhereString = (node: any): string => {
		if (!node) return '';
		if (node.type === 'double_quote_string' || node.type === 'single_quote_string') return `"${node.value}"`;
		if (node.type === 'number') return node.value.toString();
		if (node.type === 'column_ref') return node.column;
		if (node.type === 'binary_expr') {
			const operatorMap: Record<string, string> = { 'AND': '&&', 'OR': '||', '=': '=' };
			const left = buildWhereString(node.left);
			const right = buildWhereString(node.right);
			const operator = operatorMap[node.operator] || node.operator;
			const expr = `${left} ${operator} ${right}`;
			return node.parentheses ? `(${expr})` : expr;
		}
		return '';
	};
	const selectedColumns = (ast as any).columns.map((col: any) => col.expr.column).join(',');
	const tablename = (ast as any).from[0].table;
	const typeClause = `type = "tabledata" && tablename = "${tablename}"`;
	const mainWhereClause = buildWhereString((ast as any).where);
	return { select: selectedColumns, tablename: tablename, where: `${typeClause}${mainWhereClause === '' ? '' : ' && '}${mainWhereClause}` };
}

// -----------------------------------------------------------------------------
// INSERT PARSER
// -----------------------------------------------------------------------------
function parseInsert(ast: AST): InsertData {
	const insertAst = ast as any;
	const result: { [key: string]: any } = {};
	result.type = 'tabledata';
	result.tablename = insertAst.table[0].table;
	const columns: string[] = insertAst.columns;
	const values: any[] = insertAst.values[0].value;
	if (columns.length !== values.length) {
		throw new Error('Insert statement has a mismatch between columns and values.');
	}
	columns.forEach((colName, index) => {
		const valueNode = values[index];
		result[colName] = valueNode.value;
	});
	return result as InsertData;
}

// --- DEMO ---
// console.log("--- Parsing INSERT statement ---");
// const insertSql = 'insert into users (user_id, username, dept_id, building, phone_number) values (10, "fred", "ACCT", "central", "800-867-5309")';
// console.log(JSON.stringify(parseSql(insertSql), null, 2));

// console.log("--- Parsing CREATE statements ---");
// const createSql = `
//   CREATE TABLE users (
//       user_id INTEGER,
//       username TEXT,
//       dept_id INTEGER,
//       building TEXT,
//       phone_number TEXT,
//       CONSTRAINT fk__view_as__department_name 
//       FOREIGN KEY (dept_id) REFERENCES departments(dept_id),
//       INDEX idx_username (username),
//       INDEX idx_dept_id (dept_id)
//   )
// `;
// console.log(JSON.stringify(parseSql(createSql), null, 2));

// const createSql2 = `
//   CREATE TABLE departments (
//       dept_id TEXT,
// 	  department_name TEXT,
//       city TEXT,
//       INDEX idx_dept_id (dept_id)
//   )
// `;
// console.log(JSON.stringify(parseSql(createSql2), null, 2));

// console.log("\n--- Parsing SELECT statement ---");
// const selectSql = 'select username, phone_number from users where username = "fred" and (department = "accounting" or building = "central")';
// console.log(JSON.stringify(parseSql(selectSql), null, 2));

