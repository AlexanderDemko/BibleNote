/// <reference path="../typings/angularjs/angular.d.ts" />
/// <reference path="../behaviours/app.d.ts" />

module app {
    'use strict';

    export interface TextAnalyzerScope extends ng.IScope {
        loadUrl: string;
    }

    export class TextAnalyzerController {
        verses: ng.IDeferred<Array<Verse>>;
        public loadedVerses: Array<Verse>;

        url: string;
        public static $inject = ['$scope', '$http', '$q','LocalStorageService'];
        constructor(private $scope: TextAnalyzerScope, private $http: ng.IHttpService, $q: ng.IQService, private $storage: LocalStorageService) {               
            this.verses = $q.defer<Array<Verse>>();  
            this.loadedVerses = [];          
        }

        setUrl(url: string) {
            this.url = url;
        }
        
        loadVerses(reference: number = this.$storage.getItem("ref"), page: number = 0) {
            if (reference == null)
                reference = 101;
            this.$http.get<Array<Verse>>(this.url + '/' + reference + '/' + page).then(request=> {
                var ctrl = this;
                angular.forEach(request.data,(item, key) => {
                    if (ctrl.loadedVerses == null && ctrl.loadedVerses.length == 0)
                        ctrl.loadedVerses = [];                    
                    ctrl.loadedVerses.push(item);                                        
                });
                ctrl.loadedVerses.sort(v=> v.number);
                ctrl.verses.resolve(request.data);
            },
                () => {
                    this.verses.reject("Error while load verses");
                });
        }
        
                    
        getVerses() {
            return this.verses.promise;
        }

    }

    export function TextAnalyzerDirective($parse: ng.IParseService, $q: ng.IQService, $log: ng.ILogService) {
        return {
            restrict:'E',
            template: '<div class="analyzer"></div>',
            replace: false,
            controller: TextAnalyzerController,
            scope: {
                loadUrl:'@'
            },
            link: function postLink(scope: TextAnalyzerScope, element: ng.IAugmentedJQuery, attrs: ng.IAttributes, ctrl: TextAnalyzerController) {  
                attrs.$observe("loadUrl",(value) => {
                    ctrl.setUrl(scope.loadUrl);    
                    ctrl.loadVerses();                
                });
                ctrl.getVerses().then(data=> {
                    angular.forEach(data,(item, key) => {
                        element.append('<span class="verse" data-num="'+item.number+'" data-ref="'+item.reference+'">' + item.refName + '</span>');
                        angular.forEach(item.words,(word, key) => {
                            if (word.isText)
                                element.append('<span class="word" data-num="' + word.number + '" data-ref="'+word.reference+'">' + word.text + '</span>');
                            else {
                                element.append('<span class="symbol" >' + word.text + '</span>');
                            }
                        });
                    });
                });
                
            }
        };
    }

    
} 