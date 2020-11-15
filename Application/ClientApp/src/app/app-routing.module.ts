import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { NavigationProvidersListComponent } from './navigation-providers/list/navigation-providers.component';
import { BibleComponent } from './bible/bible.component';
import { OneNoteNavigationProviderComponent } from './navigation-providers/one-note/one-note.component';

const routes: Routes = [
  { path: 'bible', component: BibleComponent },
  { path: 'data-sources', component: NavigationProvidersListComponent },
  { path: 'data-sources/onenote/:id', component: OneNoteNavigationProviderComponent },
  { path: '', redirectTo: '/bible', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
