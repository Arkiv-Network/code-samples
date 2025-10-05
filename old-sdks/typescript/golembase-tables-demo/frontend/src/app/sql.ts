import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// Define a type for the request payload for clarity.
export interface SqlRequestPayload {
  appName: string;
  sql: string;
}

@Injectable({
  providedIn: 'root'
})
export class SqlService {
  private apiUrl = 'http://localhost:3000/api/dosql'; 

  constructor(private http: HttpClient) { }

  /**
   * Executes a SQL command string by sending it to the backend API.
   * @param payload An object containing the appName and the raw SQL string.
   * @returns An Observable that emits an array of result strings.
   */
  executeSql(payload: SqlRequestPayload): Observable<string[]> {
    // The body is now a JSON object. HttpClient will automatically set
    // the Content-Type to 'application/json'.
    return this.http.post<string[]>(this.apiUrl, payload).pipe(
      catchError((error) => {
        console.error('API Error:', error);
        return of([`Error executing SQL: ${error.message}`]);
      })
    );
  }
}
