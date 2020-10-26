import { Component, OnInit, OnDestroy } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { Store } from 'reduce-store';

@Component({
  selector: 'nav-providers',
  templateUrl: './navigation-providers.component.html'
})
export class NavigationProvidersListComponent implements OnInit, OnDestroy {
  public providersState: navProviders.State;

  constructor(
    private loadNavigationProvidersReducer: navProviders.LoadReducer
  ) {
    Store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
    await Store.reduce.byDelegate(navProviders.State, s => this.loadNavigationProvidersReducer.reduceAsync(s));
  }
}
