import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageSearch } from './image-search';

describe('ImageSearch', () => {
  let component: ImageSearch;
  let fixture: ComponentFixture<ImageSearch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageSearch]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImageSearch);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
