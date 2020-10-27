import { Clone, IReducer } from 'reduce-store';
import { Injectable } from '@angular/core';

import { NavigationProvidersQueriesListNavigationProviderVm, NavigationProvidersClient } from '../shared/web-clients/auto-generated';

export class State extends Clone<State> {
  items: NavigationProvidersQueriesListNavigationProviderVm[];
}

@Injectable({ providedIn: 'root' })
export class LoadReducer implements IReducer<State> {
  stateCtor = State;

  constructor(
    private client: NavigationProvidersClient,
  ) { }

  async reduceAsync(s: State = new State()): Promise<State> {

    var items = await this.client.getTop().toPromise();
    return new State({
      items
    });
  }
}
