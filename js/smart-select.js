
+function ($) {
    'use strict';

    /*===============================================================================
     ************   Smart Select   ************
     ===============================================================================*/

    $.smartSelect = {};
    var _index = 0;

    $(window).on('domLoaded', function (event, pageId, $page) {
        $.smartSelect.init($page);
    });

    $.smartSelect.init = function ($page) {
        var selects;
        if ($page.is('.smart-select')) {
            selects = $page;
        } else {
            selects = $page.find('.smart-select');
        }
        if (selects.length === 0) return;

        selects.each(function () {
            var smartSelect = $(this);
            var $select = smartSelect.find('select');
            if ($select.length === 0) return;

            var select = $select[0];
            if (select.length === 0) return;

            // 给a加上唯一的链接
            _index++;
            smartSelect.addClass('smartSelectIndex' + _index);
            smartSelect.attr('href', '/pages/sys/smartSelect.html?select=smartSelectIndex' + _index);

            var updateItemAfter = function(){
                var valueText = [];
                for (var i = 0; i < select.length; i++) {
                    if (select[i].selected) valueText.push(select[i].textContent.trim());
                }
                var itemAfter = smartSelect.find('.item-after');
                if (itemAfter.length === 0) {
                    smartSelect.find('.item-inner').append('<div class="item-after">' + valueText.join(', ') + '</div>');
                } else {
                    itemAfter.text(valueText.join(', '));
                }
            }

            updateItemAfter();
            $select.on('change', updateItemAfter)
        });
    };
}(Zepto);
