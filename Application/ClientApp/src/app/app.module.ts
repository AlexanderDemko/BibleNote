import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { ModalModule } from 'ngx-bootstrap/modal';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AppInitializer } from './app.initializer';
import { BibleComponent } from './bible/bible.component';
import { NavigationProvidersListComponent } from './navigation-providers/list/navigation-providers.component';
import { OneNoteNavigationProviderComponent } from './navigation-providers/one-note/one-note.component';
import { SharedModule } from './shared/shared.module';

@NgModule({
  declarations: [
    AppComponent,
    BibleComponent,
    NavigationProvidersListComponent,
    OneNoteNavigationProviderComponent
  ],
  imports: [
    SharedModule,
    BrowserModule,
    FormsModule,
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
