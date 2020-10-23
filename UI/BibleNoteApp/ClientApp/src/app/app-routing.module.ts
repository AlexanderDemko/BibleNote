import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { NavigationProvidersListComponent } from './navigation-providers/list/navigation-providers.component';

const routes: Routes = [
  { path: 'nav-providers', component: NavigationProvidersListComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
