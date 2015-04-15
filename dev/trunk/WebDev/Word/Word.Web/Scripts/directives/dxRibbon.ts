/// <reference path="../typings/angularjs/angular.d.ts" />
/// <reference path="../behaviours/app.d.ts" />

module app {
    'use strict';

    export interface dxRibbonScope extends ng.IScope {
        load(): void;
        uri: string;

    }

    export class dxRibbonCtrl {
        uri: string;
        currentRibbon: ng.IDeferred<dhtmlXRibbon>;
        constructor(private $scope: dxRibbonScope, private $http: ng.IHttpService,$q:ng.IQService) {    
            this.currentRibbon = $q.defer<dhtmlXRibbon>();
        }
        setUri(uri: string) {
            this.uri = uri;
        }
        load() {
            this.$http.get<RibbonSettings>(this.uri).then((request) => {
                this.currentRibbon.resolve(new dhtmlXRibbon(request.data));
            },() => {
                    this.currentRibbon.reject("Error loading promise");
                });
        }
        getCurrentRibbon() {
            return this.currentRibbon.promise;
        }
    }




    export function dxRibbon() {
        return {
            restrict: 'E',
            template: '<div id="dxRibbon"></div>',
            replace: true
        }
    }

    export function dxRibbonMethod($parse: ng.IParseService, $q: ng.IQService) {
        return {
            restrict: 'A',
            controller: dxRibbonCtrl,
            link: function postLink(scope, element, attrs, ctrl: dxRibbonCtrl) {
                attrs.$observe("dxRibbonMethod", function (value) {
                    ctrl.setUri(value + '/dxRibbon');
                    ctrl.load();
                });
           }
        }
    }

    export function dxRibbonCurrentTool($parse: ng.IParseService, $log:ng.ILogService) {
        return {
            restrict: 'A',
            require: '^dxRibbonMethod',            
            link: function postLink(scope, element, attrs, ctrl: dxRibbonCtrl) {
                var handler = $parse(attrs["dxRibbonCurrentTool"]);
                ctrl.getCurrentRibbon().then((ribbon) => {
                    ribbon.attachEvent("onStateChange", function (id, oldId) {
                        $log.debug("id:" + id + ", oldId:" + oldId);
                        scope.$apply(function () {
                            handler.assign(scope, id);
                        });
                    });
                });
            }
        }
    }
} 