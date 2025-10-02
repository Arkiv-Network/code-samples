import { Annotations, transformAnnotationsToPOJO, transformListPOJOToAnnotations, transformPOJOToAnnotations } from "@freckleface/golembase-js-transformations";
import { AccountData, Annotation, createClient, GolemBaseCreate, Tagged } from "golem-base-sdk";
import { buildFkQueries, CreateTableData, CreateTableObjToGBCreate, filterObjectBySelect, groupSqlIntoBatches, InsertObjToGBCreate, ParsedForeignKey, parseForeignKeyString, ParseResult, parseSql, SelectData, SqlBatches, SQLCreateTableToGBCreate, SQLInsertToGBCreate } from "./sql_to_object.js";
import { readFileSync } from "fs";
import * as util from 'util';

/**
 * TODO:
 * Convert all tablenames to lowercase, every time. The system is case-sensitive and if the users do create table departments and SELECT * FROM DEPARTMENTS, they won't match up.
 * Check if table name already exists; if so, update rather than create (or perhaps issue exception?)
 * Need to get lists of values like the older indexer
 * doSQL needs a path to the private key file, or by default use the ~/.config business. Presently it's just looking in the working directory.
 * SELECT seems to be ignoring the app name? When I run it with a new app name, I'm getting twice the departments etc, including other app names.
*/


const encoder = new TextEncoder();
const decoder = new TextDecoder();


const keyBytes = readFileSync('./private.key');
const key: AccountData = new Tagged("privatekey", keyBytes);
export const client = await createClient(1337, key, 'http://localhost:8545', 'ws://localhost:8545');

export const doSQL = async (app: string, big_sql: string): Promise<string[]> => {

	const delimiterRegex = /\s*;\s*/;
	const trailingSemicolonRegex = /\s*;\s*$/; // Regex for removing final semicolon

	// Remove whitespace at beginning and end via trim() and then remove final semicolon if present and then split on semicolons with optional whitespace around the semicolons
	const sqls: string[] = big_sql.trim().replace(trailingSemicolonRegex, '').split(delimiterRegex);
	console.log(sqls);

	// Parse each one and get back a data block

	let parsed: ParseResult[] = [];
	for (let sql of sqls) {
		let parsed_next = parseSql(sql);
		if (parsed_next) {
			parsed.push(parsed_next);
		}
	}

	// Group together contiguous CREATE TABLES and INSERTS, as we can send them across in a single transaction
	let batches: SqlBatches = groupSqlIntoBatches(parsed);
	console.log(batches);

	// Now go through each batch and build the golem stuff!

	console.log('WORKING THROUGH BATCHES...');

	let output: string[] = [];

	for (let batch of batches) {
		if (batch.length > 0) { // This should always be true, but just in case

			// Check the first item in the batch. If it's create-table or insert, we can combine all of these into a single transaction.
			if (batch[0].sqlType == 'create table' || batch[0].sqlType == 'insert') {
				let golemBatch: GolemBaseCreate[] = [];
				for (let createOrInsert of batch) {
					if (createOrInsert.sqlType == 'create table') {
						golemBatch.push(CreateTableObjToGBCreate(app, createOrInsert));
						output.push(`TABLE CREATED: ${createOrInsert.data?.tablename}`)
					}
					else {
						golemBatch.push(InsertObjToGBCreate(app, createOrInsert));
						output.push(`DATA INSERTED: ${createOrInsert.data?.tablename}`)
					}
				}
				//console.log(util.inspect(golemBatch, { depth: null }));

				// TODO: Run them NOW as a single transaction

				const receipts = await client.createEntities(golemBatch);
				console.log(receipts);

			}
			else {
				// There is always only one select per batch, so grab it

				let selectObj: SelectData = batch[0].data;
				const select_tables = await client.queryEntities(`app="${app}" && type="table" && tablename="${selectObj.tablename}"`);
				let FKs: Record<string, ParsedForeignKey> = {};
				if (select_tables.length > 0) {
					// Grab the table's metadata
					const table_metadata = await client.getEntityMetaData(select_tables[0]?.entityKey);
					for (let pair of table_metadata.stringAnnotations) {
						const foundFk = parseForeignKeyString(pair.value);
						if (foundFk) {
							const keyname = foundFk.localKey as string;
							FKs[keyname] = foundFk;
						}
					}
				}

				selectObj.where = `app="${app}" && ${selectObj.where}`

				const result2 = await client.queryEntities(selectObj.where);
				for (let item of result2) {
					const metadata = await client.getEntityMetaData(item.entityKey);
					// Convert to a data object
					const obj = transformAnnotationsToPOJO(metadata);
					let final = filterObjectBySelect(selectObj.select, obj);

					// Now for the foreign key view-as (if present)
					const builtFKs = buildFkQueries(final, FKs);
					if (builtFKs?.length > 0) {
						for (let fk of builtFKs) {
							// Query for the foreign key's item
							// 1. Query
							// 2. Grab metadata
							// 3. Convert to POJO

							const query_fk = await client.queryEntities(fk.queryString);

							// Grab the keyname to use (same as "view as") and store its value locally with the same name.
							// Should only return one, but just in case, just grab first

							if (query_fk && query_fk.length > 0) {
								const fk_metadata = await client.getEntityMetaData(query_fk[0].entityKey);
								const fk_pojo = transformAnnotationsToPOJO(fk_metadata);
								final[fk.viewKey] = fk_pojo[fk.viewKey];

							}
						}
					}

					//console.log('===========RESULTS OF SELECT===========')
					//console.log(final);

					output.push(JSON.stringify(final));

				}

			}

		}

	}
	//console.log('SENDING BACK OUTPUT:');
	//console.log(output);
	return output;

}

export const test1 = async () => {


	let creates: GolemBaseCreate[] = [

		SQLCreateTableToGBCreate('GOLEM-SQLTEST-v0.1',
			`CREATE TABLE users (
				user_id INTEGER,
				username TEXT,
				dept_id INTEGER,
				building TEXT,
				phone_number TEXT,
				CONSTRAINT fk__view_as__department_name 
				FOREIGN KEY (dept_id) REFERENCES departments(dept_id),
				INDEX idx_username (username),
				INDEX idx_dept_id (dept_id)
			)`
		),
		SQLCreateTableToGBCreate('GOLEM-SQLTEST-v0.1',
			`CREATE TABLE departments (
				dept_id INTEGER,
				department_name TEXT,
				city TEXT,
				INDEX idx_dept_id (dept_id),
				INDEX idx_department_name (department_name)
			)`
		),
		SQLInsertToGBCreate('GOLEM-SQLTEST-v0.1', "INSERT INTO departments (dept_id, department_name, city) values ('ACCT', 'Accounting', 'New York')"),
		SQLInsertToGBCreate('GOLEM-SQLTEST-v0.1', "INSERT INTO departments (dept_id, department_name, city) values ('IT', 'Information Technology', 'New York')"),
		SQLInsertToGBCreate('GOLEM-SQLTEST-v0.1', "INSERT INTO departments (dept_id, department_name, city) values ('MGT', 'Management', 'Boston')"),
		SQLInsertToGBCreate('GOLEM-SQLTEST-v0.1', "INSERT INTO departments (dept_id, department_name, city) values ('HR', 'Human Resources', 'Chicago')"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (101, 'asmith', 'ACCT', 'Main', '555-0101');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (102, 'bjones', 'MGT', 'West Wing', '555-0102');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (103, 'cwilliams', 'ACCT', 'Main', '555-0103');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (104, 'davis_r', 'HR', 'Annex', '555-0104');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (105, 'emiller', 'MGT', 'West Wing', '555-0105');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (106, 'fgarcia', 'IT', 'South Tower', '555-0106');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (107, 'h.chen', 'ACCT', 'Main', '555-0107');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (108, 'ijackson', 'HR', 'Annex', '555-0108');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (109, 'kim_s', 'IT', 'South Tower', '555-0109');"),
		SQLInsertToGBCreate("GOLEM-SQLTEST-v0.1", "INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (110, 'l.taylor', 'MGT', 'West Wing', '555-0110');"),

	];

	// Joins happen automatically; they're built in via view-as constraints on foreign keys

	//const receipts = await client.createEntities(creates);
	//console.log(receipts);

	// Here's a good example of why we probably want to make calls into the library at some level
	// The call happens after prepping the SQL and before selecting out the fields
	//const selectSql2 = "select username, dept_id from users where building = 'Main'";
	const selectSql = "select username, dept_id from users where building = 'West Wing'";
	const selectSqlObj = parseSql(selectSql);
	// Grab the tablename and grab its metadata
	// TODO: Store table's hash as well so we can grab it directly rather than query?
	const select_tables = await client.queryEntities(`app="GOLEM-SQLTEST-v0.1" && type="table" && tablename="${selectSqlObj?.data?.tablename}"`);
	let FKs: Record<string, ParsedForeignKey> = {};
	if (select_tables.length > 0) {
		// Grab the table's metadata
		const table_metadata = await client.getEntityMetaData(select_tables[0]?.entityKey);
		for (let pair of table_metadata.stringAnnotations) {
			const foundFk = parseForeignKeyString(pair.value);
			if (foundFk) {
				const keyname = foundFk.localKey as string;
				FKs[keyname] = foundFk;
			}
		}
	}

	const result2 = await client.queryEntities(selectSqlObj?.data?.where);
	for (let item of result2) {
		const metadata = await client.getEntityMetaData(item.entityKey);
		// Convert to a data object
		const obj = transformAnnotationsToPOJO(metadata);
		let final = filterObjectBySelect(selectSqlObj?.data?.select, obj);

		// Now for the foreign key view-as (if present)

		const builtFKs = buildFkQueries(final, FKs);
		if (builtFKs?.length > 0) {
			for (let fk of builtFKs) {
				// Query for the foreign key's item
				// 1. Query
				// 2. Grab metadata
				// 3. Convert to POJO

				const query_fk = await client.queryEntities(fk.queryString);

				// Grab the keyname to use (same as "view as") and store its value locally with the same name.
				// Should only return one, but just in case, just grab first

				if (query_fk && query_fk.length > 0) {
					const fk_metadata = await client.getEntityMetaData(query_fk[0].entityKey);
					const fk_pojo = transformAnnotationsToPOJO(fk_metadata);

					final[fk.viewKey] = fk_pojo[fk.viewKey];

				}
			}
		}

		console.log(final);
	}


}

async function testCreateInsertSelect() {
	let output = await doSQL("GOLEM-SQLTEST-v1.0", `
CREATE TABLE users (
	user_id INTEGER,
	username TEXT,
	dept_id INTEGER,
	building TEXT,
	phone_number TEXT,
	CONSTRAINT fk__view_as__department_name 
	FOREIGN KEY (dept_id) REFERENCES departments(dept_id),
	INDEX idx_username (username),
	INDEX idx_dept_id (dept_id)
);
CREATE TABLE departments (
	dept_id INTEGER,
	department_name TEXT,
	city TEXT,
	INDEX idx_dept_id (dept_id),
	INDEX idx_department_name (department_name)
);
INSERT INTO departments (dept_id, department_name, city) values ('ACCT', 'Accounting', 'New York');
INSERT INTO departments (dept_id, department_name, city) values ('IT', 'Information Technology', 'New York');
INSERT INTO departments (dept_id, department_name, city) values ('MGT', 'Management', 'Boston');
INSERT INTO departments (dept_id, department_name, city) values ('HR', 'Human Resources', 'Chicago');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (101, 'asmith', 'ACCT', 'Main', '555-0101');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (102, 'bjones', 'MGT', 'West Wing', '555-0102');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (103, 'cwilliams', 'ACCT', 'Main', '555-0103');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (104, 'davis_r', 'HR', 'Annex', '555-0104');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (105, 'emiller', 'MGT', 'West Wing', '555-0105');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (106, 'fgarcia', 'IT', 'South Tower', '555-0106');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (107, 'h.chen', 'ACCT', 'Main', '555-0107');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (108, 'ijackson', 'HR', 'Annex', '555-0108');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (109, 'kim_s', 'IT', 'South Tower', '555-0109');
INSERT INTO users (user_id, username, dept_id, building, phone_number) VALUES (110, 'l.taylor', 'MGT', 'West Wing', '555-0110');
select username, dept_id from users where building = 'West Wing';
select username, dept_id from users where building = 'South Tower';
select dept_id, department_name from departments;
`)

	console.log(output);
}


async function testSelect() {
	let output = await doSQL("GOLEM-SQLTEST-v1.0", `
		select username, dept_id from users where username = "asmith";
	`)

	console.log(output);
}

//await testSelect();
