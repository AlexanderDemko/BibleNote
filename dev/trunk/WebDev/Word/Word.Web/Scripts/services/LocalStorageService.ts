/// <reference path="../typings/modernizr/modernizr.d.ts" />
/// <reference path="../modules/app.ts" />
module app {
    'use strict';

    export class LocalStorageService {
        constructor() {
        }

        isSupported(): boolean {
            if (Modernizr.localstorage)
                return true;
            return false;
        }

        getItem(key: string):any {
            var result = null;
            if (this.isSupported()) {
                JSON.parse(window.localStorage.getItem(key));
            }
            return result;
        }


        setItem(key: string, value: any) {
            if (this.isSupported()) {
                window.localStorage.setItem(key, JSON.stringify(value));
            }
        }
        
    }
} 