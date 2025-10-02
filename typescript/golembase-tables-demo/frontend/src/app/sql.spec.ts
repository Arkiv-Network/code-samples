import { TestBed } from '@angular/core/testing';

import { Sql } from './sql';

describe('Sql', () => {
  let service: Sql;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Sql);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
