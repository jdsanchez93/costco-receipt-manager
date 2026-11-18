import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { ContactsApi } from '../api/contacts-api';
import { ContactReviewDto } from '../api/types';
import { ContactReview } from './contact-review';

const group = (name: string) => ({ displayName: name, contacts: [], canMergeAll: true });

describe('ContactReview', () => {
  let getReview: ReturnType<typeof vi.fn>;

  function setup(...responses: Observable<ContactReviewDto>[]): ContactReview {
    getReview = vi.fn();
    for (const r of responses) getReview.mockReturnValueOnce(r);
    TestBed.configureTestingModule({
      providers: [{ provide: ContactsApi, useValue: { getReview } }],
    });
    return TestBed.inject(ContactReview);
  }

  it('starts empty', () => {
    expect(setup().count()).toBe(0);
  });

  it('refresh() loads the duplicates and counts them', () => {
    const review = setup(of({ duplicates: [group('John'), group('Sam')] }));
    review.refresh();
    expect(review.count()).toBe(2);
    expect(review.duplicates().map(d => d.displayName)).toEqual(['John', 'Sam']);
  });

  it('keeps the last answer when a refresh fails', () => {
    const review = setup(of({ duplicates: [group('John')] }), throwError(() => new Error('boom')));
    review.refresh();
    review.refresh();
    expect(review.count()).toBe(1);
  });
});
