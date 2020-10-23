import { Clone, IReducer } from 'reduce-store';
import { Injectable } from '@angular/core';

import { NavigationProvidersQueriesListNavigationProviderVm, NavigationProviderClient } from '../shared/web-clients/auto-generated';

export class State extends Clone<State> {
  items: NavigationProvidersQueriesListNavigationProviderVm[];
}

@Injectable({ providedIn: 'root' })
export class LoadReducer implements IReducer<State> {
  stateCtor = State;

  constructor(
    private client: NavigationProviderClient,
  ) { }

  async reduceAsync(s: State = new State()): Promise<State> {

    var items = await this.client.getAll().toPromise();
    return new State({
      items
    });
  }
}
