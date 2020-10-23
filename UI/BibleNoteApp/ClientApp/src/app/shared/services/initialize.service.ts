import { Injectable } from '@angular/core';

import { Store, ReduceStore } from 'reduce-store';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InitializeService {
  constructor(
    private store: ReduceStore,
  ) {
    if (!environment.production) {
      (<any>window).store = Store;
    }
  }

  init(): void {
    //this.store.lazyReduce(layout.UpdateReducer);
    //this.store.lazyReduce(session.InitReducer);
  }
}

