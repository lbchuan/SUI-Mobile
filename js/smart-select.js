
+function ($) {
    'use strict';

    /*===============================================================================
     ************   Smart Select   ************
     ===============================================================================*/

    $.smartSelect = {};

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
            var name = $select.attr('name');
            var id = new Date().getTime();
            smartSelect.addClass(name + id);
            smartSelect.attr('href', '/pages/sys/smartSelect.html?select=' + name + id);

            var valueText = [];
            for (var i = 0; i < select.length; i++) {
                if (select[i].selected) valueText.push(select[i].textContent.trim());
            }

            var itemAfter = smartSelect.find('.item-after');
            if (itemAfter.length === 0) {
                smartSelect.find('.item-inner').append('<div class="item-after">' + valueText.join(', ') + '</div>');
            } else {
                var selectedText = itemAfter.text();
                if (itemAfter.hasClass('smart-select-value')) {
                    for (i = 0; i < select.length; i++) {
                        select[i].selected = select[i].textContent.trim() === selectedText.trim();
                    }
                } else {
                    itemAfter.text(valueText.join(', '));
                }
            }
        });
    };

    $.smartSelect.open = function (smartSelect, reLayout) {
        if (smartSelect.length === 0) return;

        // Parameters
        var openIn = smartSelect.attr('data-open-in') || 'picker';
        if (openIn === 'popup') {
            // 避免重复打开
            if ($('.popup.smart-select-popup').length > 0) return;
        } else if (openIn === 'picker') {
            // // 如果有已经开启的modal，则先关闭
            // if ($('.picker-modal.modal-in').length > 0 && !reLayout){
            //     if (smartSelect[0].f7SmartSelectPicker !== $('.picker-modal.modal-in:not(.modal-out)')[0]) app.closeModal($('.picker-modal.modal-in:not(.modal-out)'));
            //     else return;
            // }
        }

        var smartSelectData = smartSelect.dataset();
        var pageTitle = smartSelectData.pageTitle || smartSelect.find('.item-title').text();
        var backText = smartSelectData.backText || '返回';
        var closeText;
        if (openIn === 'picker') {
            closeText = smartSelectData.pickerCloseText || smartSelectData.backText || '返回';
        } else {
            closeText = smartSelectData.popupCloseText || smartSelectData.backText || '关闭';
        }
        var backOnSelect = smartSelectData.backOnSelect !== undefined ? smartSelectData.backOnSelect : true;
        var pickerHeight = smartSelectData.pickerHeight || 44;

        // Collect all options/values
        var select = smartSelect.find('select')[0];
        var $select = $(select);
        var $selectData = $select.dataset();
        if (select.disabled || smartSelect.hasClass('disabled') || $select.hasClass('disabled')) {
            return;
        }
        var values = [];
        var id = (new Date()).getTime();
        var inputType = select.multiple ? 'checkbox' : 'radio';
        var inputName = inputType + '-' + id;
        var maxLength = $select.attr('maxlength');
        var selectName = select.name;
        var option, optionHasMedia, optionImage, optionIcon, optionGroup, optionGroupLabel, optionPreviousGroup, optionIsLabel, previousGroup, optionColor, optionClassName, optionData;
        for (var i = 0; i < select.length; i++) {
            option = $(select[i]);
            optionData = option.dataset();
            optionImage = optionData.optionImage || $selectData.optionImage || smartSelectData.optionImage;
            optionIcon = optionData.optionIcon || $selectData.optionIcon || smartSelectData.optionIcon;
            optionHasMedia = optionImage || optionIcon || inputType === 'checkbox';
            optionColor = optionData.optionColor;
            optionClassName = optionData.optionClass;
            if (option[0].disabled) optionClassName += ' disabled';
            optionGroup = option.parent('optgroup')[0];
            optionGroupLabel = optionGroup && optionGroup.label;
            optionIsLabel = false;
            if (optionGroup) {
                if (optionGroup !== previousGroup) {
                    optionIsLabel = true;
                    previousGroup = optionGroup;
                    values.push({
                        groupLabel: optionGroupLabel,
                        isLabel: optionIsLabel
                    });
                }
            }
            values.push({
                value: option[0].value,
                text: option[0].textContent.trim(),
                selected: option[0].selected,
                group: optionGroup,
                groupLabel: optionGroupLabel,
                image: optionImage,
                icon: optionIcon,
                color: optionColor,
                className: optionClassName,
                disabled: option[0].disabled,
                inputType: inputType,
                id: id,
                hasMedia: optionHasMedia,
                checkbox: inputType === 'checkbox',
                inputName: inputName
            });
        }
    };

}(Zepto);
