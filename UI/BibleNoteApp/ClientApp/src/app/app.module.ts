import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AppInitializer } from './app.initializer';
import { NavigationProvidersListComponent } from './navigation-providers/list/navigation-providers.component';

@NgModule({
  declarations: [
    AppComponent,
    NavigationProvidersListComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule
  ],
  providers: [
    AppInitializer
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
