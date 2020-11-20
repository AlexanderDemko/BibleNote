import { Component, OnInit, OnDestroy } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { Router } from '@angular/router';

import { NavigationProvidersNavigationProviderVm, NavigationProviderType } from '@shared/web-clients/auto-generated';
import { ConfirmDialogService } from '@shared/components/confirm-dialog/confirm-dialog.service';
import { NgStoreService } from '@shared/services/store.service';

@Component({
  templateUrl: './navigation-providers.component.html'
})
export class NavigationProvidersListComponent implements OnInit, OnDestroy {
  providersState!: navProviders.State;

  constructor(
    private loadNavigationProvidersReducer: navProviders.LoadReducer,
    private deleteNavigationProviderReducer: navProviders.DeleteReducer,
    private store: NgStoreService,
    private router: Router,
    private confirmDialogService: ConfirmDialogService
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

  getProviderType(type: NavigationProviderType | undefined): string {
    if (type == undefined)
      return '';

    return NavigationProviderType[type];
  }

  getEditPageLink(provider: NavigationProvidersNavigationProviderVm): string {
    switch (provider.type) {
      case NavigationProviderType.OneNote:
        return `onenote/${provider.id}`;
      default:
        return ''; 
    }
  }

  async delete(provider: NavigationProvidersNavigationProviderVm): Promise<void> {
    if (await this.confirmDialogService.confirm("Are you sure?"))
      await this.store.reduce.byDelegate(navProviders.State, s => this.deleteNavigationProviderReducer.reduceAsync(s, provider));    
  }
}
