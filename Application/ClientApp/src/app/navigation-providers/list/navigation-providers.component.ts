import { Component, OnInit, OnDestroy } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { NgStoreService } from '../../shared/services/store.service';
import { Router } from '@angular/router';
import { BibleNoteDomainEnumsNavigationProviderType, NavigationProvidersNavigationProviderVm } from '../../shared/web-clients/auto-generated';

@Component({
  templateUrl: './navigation-providers.component.html'
})
export class NavigationProvidersListComponent implements OnInit, OnDestroy {
  providersState!: navProviders.State;

  constructor(
    private loadNavigationProvidersReducer: navProviders.LoadReducer,
    private store: NgStoreService,
    private router: Router,
  ) {
    this.store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }
    
  async ngOnInit(): Promise<void> {
    await this.store.reduce.byDelegate(navProviders.State, s => this.loadNavigationProvidersReducer.reduceAsync(s));
  }

  hideModal(): void {
    this.router.navigate(['/bible']);
  }

  getProviderType(type: BibleNoteDomainEnumsNavigationProviderType | undefined): string {
    if (type == undefined)
      return '';

    return BibleNoteDomainEnumsNavigationProviderType[type];
  }

  getEditPageLink(provider: NavigationProvidersNavigationProviderVm): string {
    switch (provider.type) {
      case BibleNoteDomainEnumsNavigationProviderType.OneNote:
        return `onenote/${provider.id}`;
      default:
        return ''; 
    }
  }
}
