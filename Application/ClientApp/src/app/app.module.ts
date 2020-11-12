import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { ModalModule } from 'ngx-bootstrap/modal';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AppInitializer } from './app.initializer';
import { BibleComponent } from './bible/bible.component';
import { NavigationProvidersListComponent } from './navigation-providers/list/navigation-providers.component';

@NgModule({
  declarations: [
    AppComponent,
    BibleComponent,
    NavigationProvidersListComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    BrowserAnimationsModule,
    BsDropdownModule.forRoot(),
    ModalModule.forRoot()
  ],
  providers: [
    AppInitializer
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
