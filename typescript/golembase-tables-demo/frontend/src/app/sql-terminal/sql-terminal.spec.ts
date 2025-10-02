import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SqlTerminal } from './sql-terminal';

describe('SqlTerminal', () => {
  let component: SqlTerminal;
  let fixture: ComponentFixture<SqlTerminal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SqlTerminal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SqlTerminal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
