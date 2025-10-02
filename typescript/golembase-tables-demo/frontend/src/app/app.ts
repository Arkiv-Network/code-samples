import { Component, signal } from '@angular/core';
import { SqlTerminalComponent } from './sql-terminal/sql-terminal';

@Component({
  selector: 'app-root',
  imports: [SqlTerminalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
}
