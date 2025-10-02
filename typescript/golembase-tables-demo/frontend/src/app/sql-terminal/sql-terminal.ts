import { Component } from '@angular/core';
import { CommonModule, KeyValue } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { SqlService } from '../sql';

// Define a type for our parsed JSON results for better type safety.
type ParsedJsonResult = {
  isJson: true;
  data: Record<string, any>;
} | {
  isJson: false;
  data: string;
};

@Component({
  selector: 'app-sql-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sql-terminal.html',
  styleUrls: ['./sql-terminal.css']
})
export class SqlTerminalComponent {
  // Add the appName property and give it a default value.
  appName: string = 'GOLEM-SQLTEST-v0.3';
  
  // The SQL query string, bound to the textarea.
  sqlQuery: string = 'CREATE TABLE users (id INT, name TEXT);\nINSERT INTO users (id, name) VALUES (1, "Alice");\nSELECT * FROM users;';
  
  // An observable to hold the array of result strings.
  results$: Observable<string[]> = of([]);
  isLoading = false;

  constructor(private sqlService: SqlService) {}

  /**
   * Executes the SQL query when the user clicks the submit button.
   */
  onSubmit() {
    if (!this.sqlQuery.trim() || !this.appName.trim()) return;
    this.isLoading = true;
    
    // Create the payload object to send to the service.
    const payload = {
      appName: this.appName,
      sql: this.sqlQuery
    };

    this.results$ = this.sqlService.executeSql(payload).pipe(
      finalize(() => this.isLoading = false)
    );
  }

  /**
   * Parses a single result line to determine if it's a JSON string or a plain message.
   */
  parseResultLine(line: string): ParsedJsonResult {
    try {
      if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
        const parsedData = JSON.parse(line);
        return { isJson: true, data: parsedData };
      }
    } catch (e) {
      // Not a valid JSON string, treat as plain text.
    }
    return { isJson: false, data: line };
  }

  /**
   * Custom comparator for the KeyValue pipe to maintain original object order.
   */
  originalOrder = (a: KeyValue<string,any>, b: KeyValue<string,any>): number => {
    return 0;
  }
}
