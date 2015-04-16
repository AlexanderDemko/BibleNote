/// <reference path="../typings/angularjs/angular.d.ts" />
/// <reference path="../behaviours/app.d.ts" />

module app {
    'use strict';

    export interface TextAnalyzerScope extends ng.IScope {
        loadUrl: string;
        hoverClass: string;
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
            this.$storage.setItem('reference', reference);            
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

        
        

        selectWord(ref: number, num:number) {

        }

        disselectWord(ref: number, num: number) {

        }

        markWord(ref: number, num: number, tag: string) {

        }

        unmarkWord(ref: number, num: number, tag: string = null) {

        }
                    
        getVerses() {
            return this.verses.promise;
        }

    }

    export function TextAnalyzerDirective($parse: ng.IParseService, $q: ng.IQService, $log: ng.ILogService) {
        return {
            restrict:'E',
            template: '<div class="analyzer"></div>',
            replace: true,
            controller: TextAnalyzerController,
            scope: {
                loadUrl: '@',
                hoverClass: '='
            },
            link: function postLink(scope: TextAnalyzerScope, element: ng.IAugmentedJQuery, attrs: ng.IAttributes, ctrl: TextAnalyzerController) {  
                $('.analyzer').on('mouseenter','.word', function () {
                    // if (!$(this).data('checked'))
                    $(this).addClass('hover')
                    .addClass(scope.hoverClass);
                    
                }).on('mouseleave','.word',function () {
                        // if (!$(this).data('checked'))
                    $(this).removeClass('hover');
                        $(this).removeClass(scope.hoverClass);
                    });

                $('.analyzer').on('click', '.verse', function () {
                    $('.word,.symbol[data-ref="' + $(this).data('ref') + '"]').addClass('hover').addClass(scope.hoverClass);

                });

                attrs.$observe("loadUrl",(value) => {
                    ctrl.setUrl(scope.loadUrl);    
                    ctrl.loadVerses();                
                });
                ctrl.getVerses().then(data=> {
                    //load ui versuses
                    angular.forEach(data,(item, key) => {
                        element.append('<span class="verse" data-num="'+item.number+'" data-ref="'+item.reference+'">' + item.refName + '</span>');
                        angular.forEach(item.words,(word, key) => {
                            if (word.isText)
                            {
                                var wordElem = angular.element('<span class="word" data-num="' + word.number + '" data-ref="' + word.reference + '">' + word.text + '</span>');                                                   
                                wordElem.appendTo(element);
                            }
                            else {
                                element.append('<span class="symbol" data-num="' + word.number + '" data-ref="' + word.reference + '">' + word.text + '</span>');
                            }
                        });
                    });
                });

               
                disableSelection($('.analyzer').get(0));

                function disableSelection(target) {                  
                        if (typeof target.onselectstart != "undefined") //IE route
                            target.onselectstart = function () { return false }
                        else if (typeof target.style.MozUserSelect != "undefined") //Firefox route
                            target.style.MozUserSelect = "none"
                        else //All other route (ie: Opera)
                            target.onmousedown = function () { return false }
                        target.style.cursor = "default"
                    
                }

                
            }
        };
    }

    
} 