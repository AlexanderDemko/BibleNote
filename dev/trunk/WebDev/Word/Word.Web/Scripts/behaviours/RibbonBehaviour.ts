/// <reference path="app.d.ts" />
/// <reference path="../typings/jquery/jquery.d.ts" />


module Word {

    
    export class RibbonBehaviour {


        constructor(public urlToGet: string, public holderDivId: string) {
        }
        _ribbonObj: dhtmlXRibbon;
        public Init() {
            var self = this;
            $.get(this.urlToGet + '/' + this.holderDivId, data=> {
                var settings: RibbonSettings = JSON.parse(data);
                self._ribbonObj = new dhtmlXRibbon(settings);
            });            
        }

        

    }
}