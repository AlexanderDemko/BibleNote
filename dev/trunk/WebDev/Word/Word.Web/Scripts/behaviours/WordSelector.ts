/// <reference path="../typings/jquery/jquery.d.ts" />


class WordSelector {

    SubscribeHoverAndClick(hoverStyle: string, checkStyle: string) {
        $('.word').click(function () {

            if ($(this).data('checked')) {
                $(this).data('checked', false);
                $(this).removeClass(hoverStyle);
                $(this).addClass(checkStyle);
            }
            else {
                $(this).removeClass(hoverStyle);
                $(this).addClass(checkStyle);
                $(this).data('checked', true);
            }

        }).hover(function () {
            // if (!$(this).data('checked'))
            $(this).addClass(hoverStyle);
        }, function () {
                // if (!$(this).data('checked'))
                $(this).removeClass(hoverStyle);
            });
    }

   

    SelectArea(selectorId: string) {
        $("#" + selectorId).html(this.SplitSentence($("#" + selectorId).text()))
        this.disableSelection(document.getElementById(selectorId));
        this.SubscribeHoverAndClick('hovered', 'checked');
    }
    
    SplitSentence(str: string) {
        this.index = 0;
        var rgxp = /\w+|([\,\;\.\s\[\]\—]+)/g;
        var result = str.match(rgxp);
        var internalHtml = "";
        for (var i in result) {
            if (/^([\,\;\.\s\[\]\—]+)$/.test(result[i])) {
                internalHtml += '<span class="space">' + result[i] + '</span>';
            }
            else {
                internalHtml += '<span class="word" id="word_'+i+'" data-number="'+i+'">' + result[i] + '</span>';
            }
            
        }
        return internalHtml;
    }

    

    

    index: number = 0;

    disableSelection(target) {
        if (typeof target.onselectstart != "undefined") //IE route
            target.onselectstart = function () { return false }
        else if (typeof target.style.MozUserSelect != "undefined") //Firefox route
            target.style.MozUserSelect = "none"
        else //All other route (ie: Opera)
            target.onmousedown = function () { return false }
        target.style.cursor = "default"
    }
}
    