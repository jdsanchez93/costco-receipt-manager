import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  let fixture: ComponentFixture<StatusBadge>;

  function setup(tone?: string): void {
    TestBed.configureTestingModule({ imports: [StatusBadge] }).compileComponents();
    fixture = TestBed.createComponent(StatusBadge);
    if (tone) fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
  }

  it('defaults to neutral tone', () => {
    setup();
    expect(fixture.nativeElement.querySelector('.badge').className).toContain('badge--neutral');
  });

  it('applies the requested tone class', () => {
    setup('success');
    expect(fixture.nativeElement.querySelector('.badge').className).toContain('badge--success');
  });

  it('projects content and exposes role="status"', () => {
    fixture = TestBed.createComponent(StatusBadge);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.badge');
    expect(el.getAttribute('role')).toBe('status');
  });
});
