import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThumbnailGallery } from './thumbnail-gallery';

describe('ThumbnailGallery', () => {
  let component: ThumbnailGallery;
  let fixture: ComponentFixture<ThumbnailGallery>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThumbnailGallery]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ThumbnailGallery);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
