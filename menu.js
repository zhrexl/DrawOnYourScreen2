/* jslint esversion: 6 */
/* exported DisplayStrings, DrawingMenu */

/*
 * Copyright 2019 Abakkk
 *
 * This file is part of DrawOnYourScreen, a drawing extension for GNOME Shell.
 * https://framagit.org/abakkk/DrawOnYourScreen
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const St = imports.gi.St;

const BoxPointer = imports.ui.boxpointer;
const Config = imports.misc.config;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Files = Me.imports.files;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const pgettext = imports.gettext.domain(Me.metadata['gettext-domain']).pgettext;

const GS_VERSION = Config.PACKAGE_VERSION;

const ICON_DIR = Me.dir.get_child('data').get_child('icons');
const SMOOTH_ICON_PATH = ICON_DIR.get_child('smooth-symbolic.svg').get_path();
const PALETTE_ICON_PATH = ICON_DIR.get_child('palette-symbolic.svg').get_path();
const COLOR_ICON_PATH = ICON_DIR.get_child('color-symbolic.svg').get_path();
const FILL_ICON_PATH = ICON_DIR.get_child('fill-symbolic.svg').get_path();
const STROKE_ICON_PATH = ICON_DIR.get_child('stroke-symbolic.svg').get_path();
const LINEJOIN_ICON_PATH = ICON_DIR.get_child('linejoin-symbolic.svg').get_path();
const LINECAP_ICON_PATH = ICON_DIR.get_child('linecap-symbolic.svg').get_path();
const FILLRULE_NONZERO_ICON_PATH = ICON_DIR.get_child('fillrule-nonzero-symbolic.svg').get_path();
const FILLRULE_EVENODD_ICON_PATH = ICON_DIR.get_child('fillrule-evenodd-symbolic.svg').get_path();
const DASHED_LINE_ICON_PATH = ICON_DIR.get_child('dashed-line-symbolic.svg').get_path();
const FULL_LINE_ICON_PATH = ICON_DIR.get_child('full-line-symbolic.svg').get_path();

// 150 labels with font-family style take ~15Mo
const FONT_FAMILY_STYLE = true;
// use 'login-dialog-message-warning' class in order to get GS theme warning color (default: #f57900)
const WARNING_COLOR_STYLE_CLASS_NAME = 'login-dialog-message-warning';

const getActor = function(object) {
    return GS_VERSION < '3.33.0' ? object.actor : object;
};

const getSummary = function(settingKey) {
    return Me.internalShortcutSettings.settings_schema.get_key(settingKey).get_summary();
};

// Used by both menu and osd notifications.
var DisplayStrings = {
    getDashedLine: function(dashed) {
        return dashed ? _("Dashed line") :
                        // Translators: as the alternative to "Dashed line"
                        _("Full line");
    },
    
    getFill: function(fill) {
        return fill ? _("Fill") :
                      // Translators: as the alternative to "Fill"
                      _("Outline");
    },
    
    get FillRule() {
        if (!this._fillRules)
            // Translators: fill-rule SVG attribute
            this._fillRules = { 0: _("Nonzero"), 1: _("Evenodd") };
        return this._fillRules;
    },
    
    getFontFamily: function(family) {
        if (!this._fontGenericFamilies)
            // Translators: generic font-family SVG attribute
            this._fontGenericFamilies = { 'Sans-Serif': pgettext("font-family", "Sans-Serif"), 'Serif': pgettext("font-family", "Serif"),
                                          'Monospace': pgettext("font-family", "Monospace"), 'Cursive': pgettext("font-family", "Cursive"),
                                          'Fantasy': pgettext("font-family", "Fantasy") };
        return this._fontGenericFamilies[family] || family;
    },
    
    get FontStyle() {
        if (!this._fontStyles)
            // Translators: font-style SVG attribute
            this._fontStyles = { 0: pgettext("font-style", "Normal"), 1: pgettext("font-style", "Oblique"), 2: pgettext("font-style", "Italic") };
        return this._fontStyles;
    },
    
    FontStyleMarkup: { 0: 'normal', 1: 'oblique', 2: 'italic' },
    
    get FontWeight() {
        if (!this._fontWeights)
            // Translators: font-weight SVG attribute
            this._fontWeights = { 100: pgettext("font-weight", "Thin"), 200: pgettext("font-weight", "Ultra Light"), 300: pgettext("font-weight", "Light"),
                                  350: pgettext("font-weight", "Semi Light"), 380: pgettext("font-weight", "Book"), 400: pgettext("font-weight", "Normal"),
                                  500: pgettext("font-weight", "Medium"), 600: pgettext("font-weight", "Semi Bold"), 700: pgettext("font-weight", "Bold"),
                                  800: pgettext("font-weight", "Ultra Bold"), 900: pgettext("font-weight", "Heavy"), 1000: pgettext("font-weight", "Ultra Heavy") };
        return this._fontWeights;
    },
    
    get LineCap() {
        if (!this._lineCaps)
            // Translators: stroke-linecap SVG attribute
            this._lineCaps = { 0: pgettext("stroke-linecap", "Butt"), 1: pgettext("stroke-linecap", "Round"), 2: pgettext("stroke-linecap", "Square") };
        return this._lineCaps;
    },
    
    get LineJoin() {
        if (!this._lineJoins)
            // Translators: stroke-linejoin SVG attribute
            this._lineJoins = { 0: pgettext("stroke-linejoin", "Miter"), 1: pgettext("stroke-linejoin", "Round"), 2: pgettext("stroke-linejoin", "Bevel") };
        return this._lineJoins;
    },
    
    getPixels(value) {
        // Translators: value in pixel unit (e.g. "5 px")
        return _("%f px").format(value);
    },
    
    getTextAlignment: function(rightAligned) {
        // Translators: text alignment
        return rightAligned ? _("Right aligned") : _("Left aligned");
    },
    
    get Tool() {
        if (!this._tools)
            this._tools = { 0: pgettext("drawing-tool", "Free drawing"), 1: pgettext("drawing-tool", "Line"), 2: pgettext("drawing-tool", "Ellipse"),
                            3: pgettext("drawing-tool", "Rectangle"), 4: pgettext("drawing-tool", "Text"), 5: pgettext("drawing-tool", "Polygon"),
                            6: pgettext("drawing-tool", "Polyline"), 7: pgettext("drawing-tool", "Image"),
                            100: pgettext("drawing-tool", "Move"), 101: pgettext("drawing-tool", "Resize"), 102: pgettext("drawing-tool", "Mirror") };
        return this._tools;
    }
};

var DrawingMenu = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingMenu',
    
    _init: function(area, monitor, drawingTools) {
        this.area = area;
        this.drawingTools = drawingTools;
        
        let side = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL ? St.Side.RIGHT : St.Side.LEFT;
        this.menu = new PopupMenu.PopupMenu(Main.layoutManager.dummyCursor, 0.25, side);
        this.menuManager = new PopupMenu.PopupMenuManager(GS_VERSION < '3.33.0' ? { actor: this.area } : this.area);
        this.menuManager.addMenu(this.menu);
        
        Main.layoutManager.uiGroup.add_actor(this.menu.actor);
        this.menu.actor.add_style_class_name('background-menu draw-on-your-screen-menu');
        this.menu.actor.set_style('max-height:' + monitor.height + 'px;');
        this.menu.actor.hide();
        this.hasSeparators = monitor.height >= 750;
        
        // do not close the menu on item activated
        this.menu.itemActivated = () => {};
        this.menu.connect('open-state-changed', this._onMenuOpenStateChanged.bind(this));
        
        // Case where the menu is closed (escape key) while the save entry clutter_text is active:
        // St.Entry clutter_text set the DEFAULT cursor on leave event with a delay and
        // overrides the cursor set by area.updatePointerCursor().
        // In order to update drawing cursor on menu closed, we need to leave the saveEntry before closing menu.
        // Since escape key press event can't be captured easily, the job is done in the menu close function.
        let menuCloseFunc = this.menu.close;
        this.menu.close = (animate) => {
            if (this.saveDrawingSubMenu && this.saveDrawingSubMenu.isOpen)
                this.saveDrawingSubMenu.close();
            menuCloseFunc.bind(this.menu)(animate);
        };
        
        this.paletteIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(PALETTE_ICON_PATH) });
        this.colorIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(COLOR_ICON_PATH) });
        this.smoothIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(SMOOTH_ICON_PATH) });
        this.strokeIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(STROKE_ICON_PATH) });
        this.fillIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(FILL_ICON_PATH) });
        this.fillRuleNonzeroIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(FILLRULE_NONZERO_ICON_PATH) });
        this.fillRuleEvenoddIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(FILLRULE_EVENODD_ICON_PATH) });
        this.linejoinIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(LINEJOIN_ICON_PATH) });
        this.linecapIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(LINECAP_ICON_PATH) });
        this.fullLineIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(FULL_LINE_ICON_PATH) });
        this.dashedLineIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(DASHED_LINE_ICON_PATH) });
    },
    
    disable: function() {
        delete this.area;
        delete this.drawingTools;
        this.menuManager.removeMenu(this.menu);
        Main.layoutManager.uiGroup.remove_actor(this.menu.actor);
        this.menu.destroy();
    },
    
    _onMenuOpenStateChanged: function(menu, open) {
        if (open) {
            this.area.setPointerCursor('DEFAULT');
        } else {
            this.area.updatePointerCursor();
            // actionMode has changed, set previous actionMode in order to keep internal shortcuts working
            this.area.updateActionMode();
            this.area.grab_key_focus();
        }
    },
    
    popup: function() {
        if (this.menu.isOpen) {
            this.close();
        } else {
            this.open();
            this.menu.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
        }
    },
    
    open: function(x, y) {
        if (this.menu.isOpen)
            return;
        if (x === undefined || y === undefined)
            [x, y] = [this.area.monitor.x + this.area.monitor.width / 2, this.area.monitor.y + this.area.monitor.height / 2];
        this._redisplay();
        Main.layoutManager.setDummyCursorGeometry(x, y, 0, 0);
        let monitor = this.area.monitor;
        this.menu._arrowAlignment = (y - monitor.y) / monitor.height;
        this.menu.open(BoxPointer.PopupAnimation.NONE);
        this.menuManager.ignoreRelease();
    },
    
    close: function() {
        if (this.menu.isOpen)
            this.menu.close();
    },
    
    _redisplay: function() {
        this.menu.removeAll();
        
        this.actionButtons = [];
        let groupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'draw-on-your-screen-menu-group-item' });
        getActor(groupItem).add_child(this._createActionButton(_("Undo"), this.area.undo.bind(this.area), 'edit-undo-symbolic'));
        getActor(groupItem).add_child(this._createActionButton(_("Redo"), this.area.redo.bind(this.area), 'edit-redo-symbolic'));
        getActor(groupItem).add_child(this._createActionButton(_("Erase"), this.area.deleteLastElement.bind(this.area), 'edit-clear-all-symbolic'));
        getActor(groupItem).add_child(this._createActionButton(_("Smooth"), this.area.smoothLastElement.bind(this.area), this.smoothIcon));
        this.menu.addMenuItem(groupItem);
        this._addSeparator(this.menu, true);
        
        this._addSubMenuItem(this.menu, 'document-edit-symbolic', DisplayStrings.Tool, this.area, 'currentTool', this._updateSectionVisibility.bind(this));
        this.paletteItem = this._addPaletteSubMenuItem(this.menu);
        this.colorItem = this._addColorSubMenuItem(this.menu);
        this.fillItem = this._addSwitchItem(this.menu, DisplayStrings.getFill(true), this.strokeIcon, this.fillIcon, this.area, 'fill', this._updateSectionVisibility.bind(this));
        this.fillSection = new PopupMenu.PopupMenuSection();
        this.fillSection.itemActivated = () => {};
        this.fillRuleItem = this._addSwitchItem(this.fillSection, DisplayStrings.FillRule[1], this.fillRuleNonzeroIcon, this.fillRuleEvenoddIcon, this.area, 'currentEvenodd');
        this.menu.addMenuItem(this.fillSection);
        this._addSeparator(this.menu);
        
        let lineSection = new PopupMenu.PopupMenuSection();
        this._addSliderItem(lineSection, this.area, 'currentLineWidth');
        this._addSubMenuItem(lineSection, this.linejoinIcon, DisplayStrings.LineJoin, this.area, 'currentLineJoin');
        this._addSubMenuItem(lineSection, this.linecapIcon, DisplayStrings.LineCap, this.area, 'currentLineCap');
        this._addSwitchItem(lineSection, DisplayStrings.getDashedLine(true), this.fullLineIcon, this.dashedLineIcon, this.area, 'dashedLine');
        this._addSeparator(lineSection);
        this.menu.addMenuItem(lineSection);
        lineSection.itemActivated = () => {};
        this.lineSection = lineSection;
        
        let fontSection = new PopupMenu.PopupMenuSection();
        this._addFontFamilySubMenuItem(fontSection, 'font-x-generic-symbolic');
        this._addSubMenuItem(fontSection, 'format-text-bold-symbolic', DisplayStrings.FontWeight, this.area, 'currentFontWeight');
        this._addSubMenuItem(fontSection, 'format-text-italic-symbolic', DisplayStrings.FontStyle, this.area, 'currentFontStyle');
        this._addSwitchItem(fontSection, DisplayStrings.getTextAlignment(true), 'format-justify-left-symbolic', 'format-justify-right-symbolic', this.area, 'currentTextRightAligned');
        this._addSeparator(fontSection);
        this.menu.addMenuItem(fontSection);
        fontSection.itemActivated = () => {};
        this.fontSection = fontSection;
        
        let imageSection = new PopupMenu.PopupMenuSection();
        let images = this.area.getImages();
        if (images.length) {
            if (this.area.currentImage > images.length - 1)
                this.area.currentImage = images.length - 1;
            this._addSubMenuItem(imageSection, null, images, this.area, 'currentImage');
        }
        this._addSeparator(imageSection);
        this.menu.addMenuItem(imageSection);
        imageSection.itemActivated = () => {};
        this.imageSection = imageSection;
        
        let areaManager = Me.stateObj.areaManager;
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-panel-and-dock-visibility'), !!areaManager.hiddenList, areaManager.togglePanelAndDockOpacity.bind(areaManager));
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-background'), this.area.hasBackground, this.area.toggleBackground.bind(this.area));
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-grid'), this.area.hasGrid, this.area.toggleGrid.bind(this.area));
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-square-area'), this.area.isSquareArea, this.area.toggleSquareArea.bind(this.area));
        this._addSeparator(this.menu);
        
        this._addDrawingNameItem(this.menu);
        this._addOpenDrawingSubMenuItem(this.menu);
        this._addSaveDrawingSubMenuItem(this.menu);
        
        this.menu.addAction(getSummary('save-as-svg'), this.area.saveAsSvg.bind(this.area), 'image-x-generic-symbolic');
        this.menu.addAction(getSummary('open-preferences'), areaManager.openPreferences.bind(areaManager), 'document-page-setup-symbolic');
        this.menu.addAction(getSummary('toggle-help'), () => { this.close(); this.area.toggleHelp(); }, 'preferences-desktop-keyboard-shortcuts-symbolic');
        
        this._updateActionSensitivity();
        this._updateSectionVisibility();
    },
    
    // from system.js (GS 3.34-)
    _createActionButton: function(accessibleName, callback, icon) {
        let button = new St.Button({ track_hover: true,
                                     x_align: Clutter.ActorAlign.CENTER,
                                     accessible_name: accessibleName,
                                     // use 'popup-menu' and 'popup-menu-item' style classes to provide theme colors
                                     style_class: 'system-menu-action popup-menu-item popup-menu' });
        button.child = new St.Icon(typeof icon == 'string' ? { icon_name: icon } : { gicon: icon });
        button.connect('clicked', () => {
            callback();
            this._updateActionSensitivity();
        });
        button.bind_property('reactive', button, 'can_focus', GObject.BindingFlags.DEFAULT);
        this.actionButtons.push(button);
        return new St.Bin({ child: button, x_expand: true });
    },
    
    _updateActionSensitivity: function() {
        let [undoButton, redoButton, eraseButton, smoothButton] = this.actionButtons;
        undoButton.reactive = this.area.elements.length > 0;
        redoButton.reactive = this.area.undoneElements.length > 0;
        eraseButton.reactive = this.area.elements.length > 0;
        smoothButton.reactive = this.area.elements.length > 0 && this.area.elements[this.area.elements.length - 1].shape == this.drawingTools.NONE;
    },
    
    _updateSectionVisibility: function() {
        let [isText, isImage] = [this.area.currentTool == this.drawingTools.TEXT, this.area.currentTool == this.drawingTools.IMAGE];
        this.lineSection.actor.visible = !isText && !isImage;
        this.fontSection.actor.visible = isText;
        this.imageSection.actor.visible = isImage;
        this.colorItem.setSensitive(!isImage);
        this.paletteItem.setSensitive(!isImage);
        this.fillItem.setSensitive(!isText && !isImage);
        this.fillSection.setSensitive(!isText && !isImage);
        
        if (this.area.fill)
            this.fillSection.actor.show();
        else
            this.fillSection.actor.hide();
    },
    
    _addSwitchItem: function(menu, label, iconFalse, iconTrue, target, targetProperty, onToggled) {
        let item = new PopupMenu.PopupSwitchMenuItem(label, target[targetProperty]);
        
        item.icon = new St.Icon({ style_class: 'popup-menu-icon' });
        getActor(item).insert_child_at_index(item.icon, 1);
        let icon = target[targetProperty] ? iconTrue : iconFalse;
        if (icon && icon instanceof GObject.Object && GObject.type_is_a(icon, Gio.Icon))
            item.icon.set_gicon(icon);
        else if (icon)
            item.icon.set_icon_name(icon);
        
        item.connect('toggled', (item, state) => {
            target[targetProperty] = state;
            let icon = target[targetProperty] ? iconTrue : iconFalse;
            if (icon && icon instanceof GObject.Object && GObject.type_is_a(icon, Gio.Icon))
                item.icon.set_gicon(icon);
            else if (icon)
                item.icon.set_icon_name(icon);
            if (onToggled)
                onToggled();
        });
        menu.addMenuItem(item);
        return item;
    },
    
    _addSimpleSwitchItem: function(menu, label, active, onToggled) {
        let item = new PopupMenu.PopupSwitchMenuItem(label, active);
        item.connect('toggled', onToggled);
        menu.addMenuItem(item);
    },
    
    _addSliderItem: function(menu, target, targetProperty) {
        let item = new PopupMenu.PopupBaseMenuItem({ activate: false });
        let label = new St.Label({ text: DisplayStrings.getPixels(target[targetProperty]), style_class: 'draw-on-your-screen-menu-slider-label' });
        let slider = new Slider.Slider(target[targetProperty] / 50);
        
        if (GS_VERSION < '3.33.0') {
            slider.connect('value-changed', (slider, value, property) => {
                target[targetProperty] = Math.max(Math.round(value * 50), 0);
                label.set_text(DisplayStrings.getPixels(target[targetProperty]));
                if (target[targetProperty] === 0)
                    label.add_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
                else
                    label.remove_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
            });
        } else {
            slider.connect('notify::value', () => {
                target[targetProperty] = Math.max(Math.round(slider.value * 50), 0);
                label.set_text(DisplayStrings.getPixels(target[targetProperty]));
                if (target[targetProperty] === 0)
                    label.add_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
                else
                    label.remove_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
            });
        }
        
        getActor(slider).x_expand = true;
        getActor(item).add_child(getActor(slider));
        getActor(item).add_child(label);
        if (slider.onKeyPressEvent)
            getActor(item).connect('key-press-event', slider.onKeyPressEvent.bind(slider));
        menu.addMenuItem(item);
    },
    
    _addSubMenuItem: function(menu, icon, obj, target, targetProperty, callback) {
        if (targetProperty == 'currentImage')
            icon = obj[target[targetProperty]].gicon;
        let item = new PopupMenu.PopupSubMenuMenuItem(String(obj[target[targetProperty]]), icon ? true : false);
        if (icon && icon instanceof GObject.Object && GObject.type_is_a(icon, Gio.Icon))
            item.icon.set_gicon(icon);
        else if (icon)
            item.icon.set_icon_name(icon);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            for (let i in obj) {
                let text;
                if (targetProperty == 'currentFontWeight')
                    text = `<span font_weight="${i}">${obj[i]}</span>`;
                else if (targetProperty == 'currentFontStyle')
                    text = `<span font_style="${DisplayStrings.FontStyleMarkup[i]}">${obj[i]}</span>`;
                else
                    text = String(obj[i]);
                
                let iCaptured = Number(i);
                let subItem = item.menu.addAction(text, () => {
                    item.label.set_text(String(obj[iCaptured]));
                    target[targetProperty] = iCaptured;
                    if (targetProperty == 'currentImage')
                        item.icon.set_gicon(obj[iCaptured].gicon);
                    if (callback)
                        callback();
                });
                
                subItem.label.get_clutter_text().set_use_markup(true);
                getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
                
                // change the display order of tools
                if (obj == DisplayStrings.Tool && i == this.drawingTools.POLYGON)
                    item.menu.moveMenuItem(subItem, 4);
                else if (obj == DisplayStrings.Tool && i == this.drawingTools.POLYLINE)
                    item.menu.moveMenuItem(subItem, 5);
            }
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
    },
    
    _addPaletteSubMenuItem: function(menu) {
        let text = _(this.area.currentPalette[0] || "Palette");
        let item = new PopupMenu.PopupSubMenuMenuItem(text, true);
        item.icon.set_gicon(this.paletteIcon);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.area.palettes.forEach(palette => {
                let [name, colors] = palette;
                if (!colors[0])
                    return;
                
                let subItem = item.menu.addAction(_(name || "Palette"), () => {
                    item.label.set_text(_(name || "Palette"));
                    this.area.currentPalette = palette;
                    this._populateColorSubMenu();
                });
                getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
            });
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
        return item;
    },
    
    _addColorSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_("Color"), true);
        this.colorSubMenu = item.menu;
        item.icon.set_gicon(this.colorIcon);
        item.icon.set_style(`color:${this.area.currentColor.to_string().slice(0, 7)};`);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        this._populateColorSubMenu();
        menu.addMenuItem(item);
        return item;
    },
    
    _populateColorSubMenu: function() {
        this.colorSubMenu.removeAll();
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.area.colors.forEach(color => {
                let text = color.string || color.to_string();
                let subItem = this.colorSubMenu.addAction(text, () => {
                    this.area.currentColor = color;
                    this.colorItem.icon.set_style(`color:${color.to_string().slice(0, 7)};`);
                });
                // Foreground color markup is not displayed since 3.36, use style instead but the transparency is lost.
                subItem.label.set_style(`color:${color.to_string().slice(0, 7)};`);
                getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
            });
            return GLib.SOURCE_REMOVE;
        });
    },
    
    _addFontFamilySubMenuItem: function(menu, icon) {
        let item = new PopupMenu.PopupSubMenuMenuItem(DisplayStrings.getFontFamily(this.area.currentFontFamily), true);
        item.icon.set_icon_name(icon);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        item.menu.openOld = item.menu.open;
        item.menu.open = (animate) => {
            if (!item.menu.isOpen && item.menu.isEmpty()) {
                this.area.fontFamilies.forEach(family => {
                    let subItem = item.menu.addAction(DisplayStrings.getFontFamily(family), () => {
                        item.label.set_text(DisplayStrings.getFontFamily(family));
                        this.area.currentFontFamily = family;
                    });
                    if (FONT_FAMILY_STYLE)
                        subItem.label.set_style(`font-family:${family}`);
                    getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
                });
            }
            item.menu.openOld();
        };
        
        menu.addMenuItem(item);
    },
    
    _addDrawingNameItem: function(menu) {
        this.drawingNameMenuItem = new PopupMenu.PopupMenuItem('', { reactive: false, activate: false });
        this.drawingNameMenuItem.setSensitive(false);
        menu.addMenuItem(this.drawingNameMenuItem);
        this._updateDrawingNameMenuItem();
    },
    
    _updateDrawingNameMenuItem: function() {
        getActor(this.drawingNameMenuItem).visible = this.area.jsonName ? true : false;
        if (this.area.jsonName) {
            let prefix = this.area.drawingContentsHasChanged ? "* " : "";
            this.drawingNameMenuItem.label.set_text(`<i>${prefix}${this.area.jsonName}</i>`);
            this.drawingNameMenuItem.label.get_clutter_text().set_use_markup(true);
        }
    },
    
    _addOpenDrawingSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_("Open drawing"), true);
        this.openDrawingSubMenuItem = item;
        this.openDrawingSubMenu = item.menu;
        item.setSensitive(Boolean(Files.getJsons().length));
        item.icon.set_icon_name('document-open-symbolic');
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        item.menu.openOld = item.menu.open;
        item.menu.open = (animate) => {
            if (!item.menu.isOpen)
                this._populateOpenDrawingSubMenu();
            item.menu.openOld();
        };
        
        menu.addMenuItem(item);
    },
    
    _populateOpenDrawingSubMenu: function() {
        this.openDrawingSubMenu.removeAll();
        let jsons = Files.getJsons();
        jsons.forEach(json => {
            let subItem = this.openDrawingSubMenu.addAction(`<i>${String(json)}</i>`, () => {
                this.area.loadJson(json.name);
                this._updateDrawingNameMenuItem();
                this._updateSaveDrawingSubMenuItemSensitivity();
            });
            subItem.label.get_clutter_text().set_use_markup(true);
            getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
            
            let expander = new St.Bin({
                style_class: 'popup-menu-item-expander',
                x_expand: true,
            });
            getActor(subItem).add_child(expander);
            
            let deleteButton = new St.Button({ style_class: 'draw-on-your-screen-menu-delete-button',
                                               child: new St.Icon({ icon_name: 'edit-delete-symbolic',
                                                                    style_class: 'popup-menu-icon',
                                                                    x_align: Clutter.ActorAlign.END }) });
            getActor(subItem).add_child(deleteButton);
            
            deleteButton.connect('clicked', () => {
                json.delete();
                subItem.destroy();
                this.openDrawingSubMenuItem.setSensitive(!this.openDrawingSubMenu.isEmpty());
            });
        });
        
        this.openDrawingSubMenuItem.setSensitive(!this.openDrawingSubMenu.isEmpty());
    },
    
    _addSaveDrawingSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(getSummary('save-as-json'), true);
        this.saveDrawingSubMenuItem = item;
        this._updateSaveDrawingSubMenuItemSensitivity();
        this.saveDrawingSubMenu = item.menu;
        item.icon.set_icon_name('document-save-symbolic');
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        item.menu.openOld = item.menu.open;
        item.menu.open = (animate) => {
            if (!item.menu.isOpen)
                this._populateSaveDrawingSubMenu();
            item.menu.openOld();
        };
        menu.addMenuItem(item);
    },
    
    _updateSaveDrawingSubMenuItemSensitivity: function() {
        this.saveDrawingSubMenuItem.setSensitive(this.area.elements.length > 0);
    },
    
    _onDrawingSaved() {
        this._updateDrawingNameMenuItem();
        this.openDrawingSubMenuItem.setSensitive(true);
    },
    
    _populateSaveDrawingSubMenu: function() {
        this.saveDrawingSubMenu.removeAll();
        let saveEntry = new DrawingMenuEntry({ initialTextGetter: Files.getDateString,
                                                entryActivateCallback: (text) => {
                                                    this.area.saveAsJsonWithName(text, this._onDrawingSaved.bind(this));
                                                    this.saveDrawingSubMenu.toggle();
                                                },
                                                invalidStrings: [Me.metadata['persistent-file-name'], '/'],
                                                primaryIconName: 'insert-text' });
        this.saveDrawingSubMenu.addMenuItem(saveEntry.item);
    },
    
    _addSeparator: function(menu, thin) {
        if (this.hasSeparators) {
            let separatorItem = new PopupMenu.PopupSeparatorMenuItem(' ');
            getActor(separatorItem).add_style_class_name('draw-on-your-screen-menu-separator-item');
            if (thin)
                getActor(separatorItem).add_style_class_name('draw-on-your-screen-menu-thin-separator-item');
            menu.addMenuItem(separatorItem);
        }
    }
});

// based on ApplicationsButton.scrollToButton , https://gitlab.gnome.org/GNOME/gnome-shell-extensions/blob/master/extensions/apps-menu/extension.js
const updateSubMenuAdjustment = function(itemActor) {
    let scrollView = itemActor.get_parent().get_parent();
    let adjustment = scrollView.get_vscroll_bar().get_adjustment();
    let scrollViewAlloc = scrollView.get_allocation_box();
    let currentScrollValue = adjustment.get_value();
    let height = scrollViewAlloc.y2 - scrollViewAlloc.y1;
    let itemActorAlloc = itemActor.get_allocation_box();
    let newScrollValue = currentScrollValue;
    if (currentScrollValue > itemActorAlloc.y1 - 10)
        newScrollValue = itemActorAlloc.y1 - 10;
    if (height + currentScrollValue < itemActorAlloc.y2 + 10)
        newScrollValue = itemActorAlloc.y2 - height + 10;
    if (newScrollValue != currentScrollValue)
        adjustment.set_value(newScrollValue);
};

// based on searchItem.js, https://github.com/leonardo-bartoli/gnome-shell-extension-Recents
const DrawingMenuEntry = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingMenuEntry',
    
    _init: function(params) {
        this.params = params;
        this.item = new PopupMenu.PopupBaseMenuItem({ style_class: 'draw-on-your-screen-menu-entry-item',
                                                      activate: false,
                                                      reactive: true,
                                                      can_focus: false });
        
        this.itemActor = GS_VERSION < '3.33.0' ? this.item.actor : this.item;
        
        this.entry = new St.Entry({
            style_class: 'search-entry draw-on-your-screen-menu-entry',
            track_hover: true,
            reactive: true,
            can_focus: true,
            x_expand: true
        });
        
        this.entry.set_primary_icon(new St.Icon({ style_class: 'search-entry-icon',
                                                  icon_name: this.params.primaryIconName }));
        
        this.entry.clutter_text.connect('text-changed', this._onTextChanged.bind(this));
        this.entry.clutter_text.connect('activate', this._onTextActivated.bind(this));
        
        this.clearIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-clear-symbolic'
        });
        this.entry.connect('secondary-icon-clicked', this._reset.bind(this));
        
        getActor(this.item).add_child(this.entry);
        getActor(this.item).connect('notify::mapped', (actor) => {
            if (actor.mapped) {
                this.entry.set_text(this.params.initialTextGetter());
                this.entry.clutter_text.grab_key_focus();
            }
        });
    },
    
    _setError: function(hasError) {
        if (hasError)
            this.entry.add_style_class_name('draw-on-your-screen-menu-entry-error');
        else
            this.entry.remove_style_class_name('draw-on-your-screen-menu-entry-error');
    },
    
    _reset: function() {
        this.entry.text = '';
        this.entry.clutter_text.set_cursor_visible(true);
        this.entry.clutter_text.set_selection(0, 0);
        this._setError(false);
    },
    
    _onTextActivated: function(clutterText) {
        let text = clutterText.get_text();
        if (text.length == 0)
            return;
        if (this._getIsInvalid())
            return;
        this._reset();
        this.params.entryActivateCallback(text);
    },
    
    _onTextChanged: function(clutterText) {
        let text = clutterText.get_text();
        this.entry.set_secondary_icon(text.length ? this.clearIcon : null);
        
        if (text.length)
            this._setError(this._getIsInvalid());
    },
    
    _getIsInvalid: function() {
        for (let i = 0; i < this.params.invalidStrings.length; i++) {
            if (this.entry.text.indexOf(this.params.invalidStrings[i]) != -1)
                return true;
        }
        
        return false;
    }
});


