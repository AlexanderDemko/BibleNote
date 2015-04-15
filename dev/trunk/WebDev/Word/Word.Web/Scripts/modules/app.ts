/// <reference path="../typings/angularjs/angular.d.ts" />
/// <reference path="../directives/dxribbon.ts" />
/// <reference path="../directives/textanalyzer.ts" />
/// <reference path="../services/localstorageservice.ts" />

module app {
    'use strict';
    export var ngModule = angular.module('app', [])
        .config(['$logProvider', function ($logProvider) {
            $logProvider.debugEnabled(true);
        }])   
        .directive('dxRibbon', dxRibbon)
        .directive('dxRibbonMethod',  dxRibbonMethod)
        .directive('dxRibbonCurrentTool', dxRibbonCurrentTool)
        .directive('wordTextAnalyzer', TextAnalyzerDirective)
        .service('LocalStorageService',LocalStorageService)
        ;
}