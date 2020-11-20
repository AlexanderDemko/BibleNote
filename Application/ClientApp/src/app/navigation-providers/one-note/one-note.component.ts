import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import * as navProviders from '@app/navigation-providers/state';
import { NgStoreService } from '@shared/services/store.service';
import {
  NavigationProvidersClient,
  NavigationProvidersOneNoteNavigationProviderVm,
  OneNoteHierarchyType,
  OneNoteHierarchyInfo,
  OneNoteNavigationProviderParameters,
  NavigationProviderType
} from '@shared/web-clients/auto-generated';

@Component({
  templateUrl: './one-note.component.html'
})
export class OneNoteNavigationProviderComponent implements OnInit, OnDestroy {
  providersState!: navProviders.State;
  provider: NavigationProvidersOneNoteNavigationProviderVm | undefined;  

  constructor(
    private store: NgStoreService,
    private client: NavigationProvidersClient,
    private zone: NgZone,
    private router: Router,
    private route: ActivatedRoute
  ) {
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
    this.route.params.subscribe(async params => {
      const providerId = params['id'];
      if (providerId > 0)
        this.provider = await this.client.getOneNoteProviderInfo(providerId).toPromise();
      else
        this.provider = <NavigationProvidersOneNoteNavigationProviderVm>{
          type: NavigationProviderType.OneNote,
          parameters: <OneNoteNavigationProviderParameters>{ hierarchyItems: [] }
        };
    });
  }

  getHierarchyTypeName(type: OneNoteHierarchyType): string {
    return OneNoteHierarchyType[type];
  }

  removeHierarchyItem(hierarchyItem: OneNoteHierarchyInfo): void {
    this.provider.parameters.hierarchyItems =
      this.provider.parameters.hierarchyItems.filter(hi => hi.id != hierarchyItem.id);
  }

  async callSelectHierarchyItemsDialog(): Promise<void> {
    var component = this;
    (<any>window).onOneNoteHierarchyItemSelected = function (value: string) {
      component.zone.run(() => component.responseFromServer(value))
    };

    await this.client.callOneNoteSelectHierarchyItemDialog("Select hierarchy items", "Select Notebook, Section Group or Section", "Select", "window.onOneNoteHierarchyItemSelected").toPromise();
  }

  async responseFromServer(hierarchyId: string): Promise<void> {
    if (this.provider == undefined)
      return;

    const selectedHierarchyItem = await this.client.getOneNoteHierarchyItemInfo(hierarchyId).toPromise();
    this.provider?.parameters?.hierarchyItems.push(selectedHierarchyItem);
  }

  async save(): Promise<void> {
    if (!this.provider.id)
      await this.client.createOneNoteProvider(this.provider).toPromise();
    else
      await this.client.updateOneNoteProvider(this.provider).toPromise();

    this.router.navigate(['/data-sources']);
  }

  cancel(): void {
    this.router.navigate(['/data-sources']);
  }
}
