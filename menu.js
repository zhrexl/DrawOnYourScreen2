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
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const St = imports.gi.St;

const BoxPointer = imports.ui.boxpointer;
const Config = imports.misc.config;
const Dash = imports.ui.dash;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Files = Me.imports.files;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const pgettext = imports.gettext.domain(Me.metadata['gettext-domain']).pgettext;

const GS_VERSION = Config.PACKAGE_VERSION;
// 150 labels with font-family style take ~15Mo
const FONT_FAMILY_STYLE = true;
// use 'login-dialog-message-warning' class in order to get GS theme warning color (default: #f57900)
const WARNING_COLOR_STYLE_CLASS_NAME = 'login-dialog-message-warning';
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');
const TextAlignmentIcon = { 0: Files.Icons.LEFT_ALIGNED, 1: Files.Icons.CENTERED, 2: Files.Icons.RIGHT_ALIGNED };

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
        if (!this._FillRule)
            // Translators: fill-rule SVG attribute
            this._FillRule = { 0: _("Nonzero"), 1: _("Evenodd") };
        return this._FillRule;
    },
    
    getFontFamily: function(family) {
        if (!this._FontGenericFamily)
            // Translators: generic font-family SVG attribute
            this._FontGenericFamily = { 'Sans-Serif': pgettext("font-family", "Sans-Serif"), 'Serif': pgettext("font-family", "Serif"),
                                        'Monospace': pgettext("font-family", "Monospace"), 'Cursive': pgettext("font-family", "Cursive"),
                                        'Fantasy': pgettext("font-family", "Fantasy") };
        return this._FontGenericFamily[family] || family;
    },
    
    get FontStyle() {
        if (!this._FontStyle)
            // Translators: font-style SVG attribute
            this._FontStyle = { 0: pgettext("font-style", "Normal"), 1: pgettext("font-style", "Oblique"), 2: pgettext("font-style", "Italic") };
        return this._FontStyle;
    },
    
    FontStyleMarkup: { 0: 'normal', 1: 'oblique', 2: 'italic' },
    
    get FontWeight() {
        if (!this._FontWeight)
            // Translators: font-weight SVG attribute
            this._FontWeight = { 100: pgettext("font-weight", "Thin"), 200: pgettext("font-weight", "Ultra Light"), 300: pgettext("font-weight", "Light"),
                                 350: pgettext("font-weight", "Semi Light"), 380: pgettext("font-weight", "Book"), 400: pgettext("font-weight", "Normal"),
                                 500: pgettext("font-weight", "Medium"), 600: pgettext("font-weight", "Semi Bold"), 700: pgettext("font-weight", "Bold"),
                                 800: pgettext("font-weight", "Ultra Bold"), 900: pgettext("font-weight", "Heavy"), 1000: pgettext("font-weight", "Ultra Heavy") };
        return this._FontWeight;
    },
    
    get LineCap() {
        if (!this._LineCap)
            // Translators: stroke-linecap SVG attribute
            this._LineCap = { 0: pgettext("stroke-linecap", "Butt"), 1: pgettext("stroke-linecap", "Round"), 2: pgettext("stroke-linecap", "Square") };
        return this._LineCap;
    },
    
    get LineJoin() {
        if (!this._LineJoin)
            // Translators: stroke-linejoin SVG attribute
            this._LineJoin = { 0: pgettext("stroke-linejoin", "Miter"), 1: pgettext("stroke-linejoin", "Round"), 2: pgettext("stroke-linejoin", "Bevel") };
        return this._LineJoin;
    },
    
    getPixels(value) {
        // Translators: value in pixel unit (e.g. "5 px")
        return _("%f px").format(value);
    },
    
    get TextAlignment() {
        // Translators: text alignment
        if (!this._TextAlignment)
            this._TextAlignment = { 0: _("Left aligned"), 1: _("Centered"), 2: _("Right aligned") };
        
        return this._TextAlignment;
    },
    
    get Tool() {
        if (!this._Tool)
            this._Tool = { 0: pgettext("drawing-tool", "Free drawing"), 1: pgettext("drawing-tool", "Line"), 2: pgettext("drawing-tool", "Ellipse"),
                           3: pgettext("drawing-tool", "Rectangle"), 4: pgettext("drawing-tool", "Text"), 5: pgettext("drawing-tool", "Polygon"),
                           6: pgettext("drawing-tool", "Polyline"), 7: pgettext("drawing-tool", "Image"),
                           100: pgettext("drawing-tool", "Move"), 101: pgettext("drawing-tool", "Resize"), 102: pgettext("drawing-tool", "Mirror") };
        return this._Tool;
    }
};

var DrawingMenu = new Lang.Class({
    Name: `${UUID}-DrawingMenu`,
    
    _init: function(area, monitor, DrawingTool, areaManagerUtils) {
        this.area = area;
        this.monitor = monitor;
        this.DrawingTool = DrawingTool;
        this.areaManagerUtils = areaManagerUtils;
        
        let side = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL ? St.Side.RIGHT : St.Side.LEFT;
        this.menu = new PopupMenu.PopupMenu(Main.layoutManager.dummyCursor, 0.25, side);
        this.menuManager = new PopupMenu.PopupMenuManager(GS_VERSION < '3.33.0' ? { actor: this.area } : this.area);
        this.menuManager.addMenu(this.menu);
        
        Main.layoutManager.uiGroup.add_actor(this.menu.actor);
        
        this.menu.actor.add_style_class_name('background-menu draw-on-your-screen-menu');
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
    },
    
    disable: function() {
        delete this.area;
        delete this.DrawingTool;
        delete this.areaManagerUtils;
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
        
        let workArea = Main.layoutManager.getWorkAreaForMonitor(this.monitor.index);
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let maxHeight = Math.round(workArea.height / scaleFactor);
        this.menu.actor.set_style(`max-height:${maxHeight}px;`);
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
        
        let groupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'draw-on-your-screen-menu-group-item' });
        this.undoButton = new ActionButton(getSummary('undo'), 'edit-undo-symbolic', this.area.undo.bind(this.area), this._updateActionSensitivity.bind(this));
        this.redoButton = new ActionButton(getSummary('redo'), 'edit-redo-symbolic', this.area.redo.bind(this.area), this._updateActionSensitivity.bind(this));
        this.eraseButton = new ActionButton(_("Erase"), 'edit-clear-all-symbolic', this.area.deleteLastElement.bind(this.area), this._updateActionSensitivity.bind(this));
        this.smoothButton = new ActionButton(_("Smooth"), Files.Icons.SMOOTH, this.area.smoothLastElement.bind(this.area), this._updateActionSensitivity.bind(this));
        this.eraseButton.child.add_style_class_name('draw-on-your-screen-menu-destructive-button');
        getActor(groupItem).add_child(this.undoButton);
        getActor(groupItem).add_child(this.redoButton);
        getActor(groupItem).add_child(this.eraseButton);
        getActor(groupItem).add_child(this.smoothButton);
        this.menu.addMenuItem(groupItem);
        this._addSeparator(this.menu, true);
        
        this.toolItem = this._addToolSubMenuItem(this.menu, this._updateSectionVisibility.bind(this));
        this.paletteItem = this._addPaletteSubMenuItem(this.menu, Files.Icons.PALETTE);
        this.colorItem = this._addColorSubMenuItem(this.menu, Files.Icons.COLOR);
        this.fillItem = this._addSwitchItem(this.menu, DisplayStrings.getFill(true), Files.Icons.STROKE, Files.Icons.FILL, this.area, 'fill', this._updateSectionVisibility.bind(this));
        this.fillSection = new PopupMenu.PopupMenuSection();
        this.fillSection.itemActivated = () => {};
        this.fillRuleItem = this._addSwitchItem(this.fillSection, DisplayStrings.FillRule[1], Files.Icons.FILLRULE_NONZERO, Files.Icons.FILLRULE_EVENODD, this.area, 'currentEvenodd');
        this.menu.addMenuItem(this.fillSection);
        this._addSeparator(this.menu);
        
        let lineSection = new PopupMenu.PopupMenuSection();
        this._addSliderItem(lineSection, this.area, 'currentLineWidth');
        this._addSubMenuItem(lineSection, Files.Icons.LINEJOIN, DisplayStrings.LineJoin, this.area, 'currentLineJoin');
        this._addSubMenuItem(lineSection, Files.Icons.LINECAP, DisplayStrings.LineCap, this.area, 'currentLineCap');
        this._addSwitchItem(lineSection, DisplayStrings.getDashedLine(true), Files.Icons.FULL_LINE, Files.Icons.DASHED_LINE, this.area, 'dashedLine');
        this._addSeparator(lineSection);
        this.menu.addMenuItem(lineSection);
        lineSection.itemActivated = () => {};
        this.lineSection = lineSection;
        
        let fontSection = new PopupMenu.PopupMenuSection();
        this._addFontFamilySubMenuItem(fontSection, Files.Icons.FONT_FAMILY);
        this._addSubMenuItem(fontSection, Files.Icons.FONT_WEIGHT, DisplayStrings.FontWeight, this.area, 'currentFontWeight');
        this._addSubMenuItem(fontSection, Files.Icons.FONT_STYLE, DisplayStrings.FontStyle, this.area, 'currentFontStyle');
        this._addTextAlignmentSubMenuItem(fontSection);
        this._addSeparator(fontSection);
        this.menu.addMenuItem(fontSection);
        fontSection.itemActivated = () => {};
        this.fontSection = fontSection;
        
        let imageSection = new PopupMenu.PopupMenuSection();
        this.imageItem = this._addImageSubMenuItem(imageSection);
        this._addSeparator(imageSection);
        this.menu.addMenuItem(imageSection);
        imageSection.itemActivated = () => {};
        this.imageSection = imageSection;
        
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-panel-and-dock-visibility'), !!this.areaManagerUtils.getHiddenList(), this.areaManagerUtils.togglePanelAndDockOpacity);
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-background'), this.area.hasBackground, this.area.toggleBackground.bind(this.area));
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-grid'), this.area.hasGrid, this.area.toggleGrid.bind(this.area));
        this._addSimpleSwitchItem(this.menu, getSummary('toggle-square-area'), this.area.isSquareArea, this.area.toggleSquareArea.bind(this.area));
        this._addSeparator(this.menu);
        
        this._addDrawingNameItem(this.menu);
        this._addOpenDrawingSubMenuItem(this.menu, _("Open drawing"), 'document-open-symbolic');
        this._addSaveDrawingSubMenuItem(this.menu, _("Save drawing as…"), 'document-save-as-symbolic');
        this._addSeparator(this.menu);
        
        groupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'draw-on-your-screen-menu-group-item' });
        this.saveButton = new ActionButton(getSummary('save-as-json'), 'document-save-symbolic', this.area.saveAsJson.bind(this.area, false, this._onDrawingSaved.bind(this)), null);
        this.svgButton = new ActionButton(getSummary('export-to-svg'), Files.Icons.DOCUMENT_EXPORT, this.area.exportToSvg.bind(this.area), null);
        this.prefsButton = new ActionButton(getSummary('open-preferences'), 'document-page-setup-symbolic', this.areaManagerUtils.openPreferences, null);
        this.helpButton = new ActionButton(getSummary('toggle-help'), 'preferences-desktop-keyboard-shortcuts-symbolic', () => { this.close(); this.area.toggleHelp(); }, null);
        getActor(groupItem).add_child(this.saveButton);
        getActor(groupItem).add_child(this.svgButton);
        getActor(groupItem).add_child(this.prefsButton);
        getActor(groupItem).add_child(this.helpButton);
        this.menu.addMenuItem(groupItem);
        
        this._updateActionSensitivity();
        this._updateSectionVisibility();
    },
    
    _updateActionSensitivity: function() {
        this.undoButton.child.reactive = this.area.elements.length > 0;
        this.redoButton.child.reactive = this.area.undoneElements.length > 0 || (this.area.elements.length && this.area.elements[this.area.elements.length - 1].canUndo);
        this.eraseButton.child.reactive = this.area.elements.length > 0;
        this.smoothButton.child.reactive = this.area.elements.length > 0 && this.area.elements[this.area.elements.length - 1].shape == this.DrawingTool.NONE;
        this.saveButton.child.reactive = this.area.elements.length > 0;
        this.svgButton.child.reactive = this.area.elements.length > 0;
        this.saveDrawingSubMenuItem.setSensitive(this.area.elements.length > 0);
    },
    
    _updateSectionVisibility: function() {
        let [isText, isImage] = [this.area.currentTool == this.DrawingTool.TEXT, this.area.currentTool == this.DrawingTool.IMAGE];
        this.lineSection.actor.visible = !isText && !isImage;
        this.fontSection.actor.visible = isText;
        this.imageSection.actor.visible = isImage;
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
        if (icon)
            item.icon.set_gicon(icon);
        
        item.connect('toggled', (item, state) => {
            target[targetProperty] = state;
            let icon = target[targetProperty] ? iconTrue : iconFalse;
            if (icon)
                item.icon.set_gicon(icon);
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
    
    _addSubMenuItem: function(menu, icon, obj, target, targetProperty) {
        let item = new PopupMenu.PopupSubMenuMenuItem(String(obj[target[targetProperty]]), icon ? true : false);
        
        item.icon.set_gicon(icon);
        item.menu.itemActivated = item.menu.close;
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            Object.keys(obj).forEach(key => {
                let text = targetProperty == 'currentFontWeight' ? `<span font_weight="${key}">${obj[key]}</span>` :
                           targetProperty == 'currentFontStyle' ? `<span font_style="${DisplayStrings.FontStyleMarkup[key]}">${obj[key]}</span>` :
                           String(obj[key]);
                
                let subItem = item.menu.addAction(text, () => {
                    item.label.set_text(String(obj[key]));
                    target[targetProperty] = Number(key);
                });
                
                subItem.label.get_clutter_text().set_use_markup(true);
                getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
            });
            return GLib.SOURCE_REMOVE;
        });
        
        menu.addMenuItem(item);
    },
    
    _addToolSubMenuItem: function(menu, callback) {
        let item = new PopupMenu.PopupSubMenuMenuItem('', true);
        item.update = () => {
            item.label.set_text(DisplayStrings.Tool[this.area.currentTool]);
            let toolName = this.DrawingTool.getNameOf(this.area.currentTool);
            item.icon.set_gicon(Files.Icons[`TOOL_${toolName}`]);
        };
        item.update();
        
        item.menu.itemActivated = item.menu.close;
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            Object.keys(DisplayStrings.Tool).forEach(key => {
                let text = DisplayStrings.Tool[key];
                let toolName = this.DrawingTool.getNameOf(key);
                let subItemIcon = Files.Icons[`TOOL_${toolName}`];
                let subItem = item.menu.addAction(text, () => {
                    this.area.currentTool = Number(key);
                    item.update();
                    callback();
                }, subItemIcon);
                
                subItem.label.get_clutter_text().set_use_markup(true);
                getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
                
                // change the display order of tools
                if (key == this.DrawingTool.POLYGON)
                    item.menu.moveMenuItem(subItem, Number(this.DrawingTool.TEXT));
                else if (key == this.DrawingTool.POLYLINE)
                    item.menu.moveMenuItem(subItem, Number(this.DrawingTool.TEXT) + 1);
            });
            return GLib.SOURCE_REMOVE;
        });
        
        menu.addMenuItem(item);
        return item;
    },
    
    _addPaletteSubMenuItem: function(menu, icon) {
        let text = _(this.area.currentPalette[0] || "Palette");
        let item = new PopupMenu.PopupSubMenuMenuItem(text, true);
        item.icon.set_gicon(icon);
        
        item.menu.itemActivated = item.menu.close;
        
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
    
    _addColorSubMenuItem: function(menu, icon) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_("Color"), true);
        this.colorSubMenu = item.menu;
        item.icon.set_gicon(icon);
        item.icon.set_style(`color:${this.area.currentColor.to_string().slice(0, 7)};`);
        
        if (GS_VERSION >= '3.30') {
            let colorPickerCallback = () => {
                this.close();
                this.area.pickColor();
            };
            // Translators: It is displayed in a menu button tooltip or as a shortcut action description, so it should NOT use the imperative mood.
            let colorPickerButton = new ActionButton(_("Pick a color"), Files.Icons.COLOR_PICKER, colorPickerCallback, null, true);
            let index = getActor(item).get_children().length - 1;
            getActor(item).insert_child_at_index(colorPickerButton, index);
        }
        
        item.menu.itemActivated = item.menu.close;
        
        this._populateColorSubMenu();
        menu.addMenuItem(item);
        return item;
    },
    
    _populateColorSubMenu: function() {
        this.colorSubMenu.removeAll();
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.area.colors.forEach(color => {
                let text = String(color);
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
        item.icon.set_gicon(icon);
        
        item.menu.itemActivated = item.menu.close;
        item.menu.actor.add_style_class_name('draw-on-your-screen-menu-ellipsized');
        
        item.menu.openOld = item.menu.open;
        item.menu.open = (animate) => {
            if (!item.menu.isOpen && item.menu.isEmpty()) {
                this.area.fontFamilies.forEach(family => {
                    let subItem = item.menu.addAction(DisplayStrings.getFontFamily(family), () => {
                        item.label.set_text(DisplayStrings.getFontFamily(family));
                        this.area.currentFontFamily = family;
                    });
                    
                    if (FONT_FAMILY_STYLE)
                        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                            subItem.label.set_style(`font-family:${family}`);
                        });
                    
                    getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
                });
            }
            item.menu.openOld();
        };
        
        menu.addMenuItem(item);
    },
    
    _addTextAlignmentSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(DisplayStrings.TextAlignment[this.area.currentTextAlignment], true);
        item.icon.set_gicon(TextAlignmentIcon[this.area.currentTextAlignment]);
        
        item.menu.itemActivated = item.menu.close;
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            Object.keys(TextAlignmentIcon).forEach(key => {
                let subItem = item.menu.addAction(DisplayStrings.TextAlignment[key], () => {
                    item.label.set_text(DisplayStrings.TextAlignment[key]);
                    this.area.currentTextAlignment = key;
                    item.icon.set_gicon(TextAlignmentIcon[key]);
                });
                
                getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
            });
            return GLib.SOURCE_REMOVE;
        });
        
        menu.addMenuItem(item);
    },
    
    _addImageSubMenuItem: function(menu, images) {
        let item = new PopupMenu.PopupSubMenuMenuItem('', true);
        item.update = () => {
            item.label.set_text(this.area.currentImage.toString());
            item.icon.set_gicon(this.area.currentImage.gicon);
        };
        item.update();
        
        item.menu.itemActivated = item.menu.close;
        item.menu.actor.add_style_class_name('draw-on-your-screen-menu-ellipsized');
        
        item.menu.openOld = item.menu.open;
        item.menu.open = (animate) => {
            if (!item.menu.isOpen && item.menu.isEmpty()) {
                Files.Images.getSorted().forEach(image => {
                    let subItem = item.menu.addAction(image.toString(), () => {
                        this.area.currentImage = image;
                        item.update();
                    }, Files.Icons.FAKE);
                    
                    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        if (subItem.setIcon && image.thumbnailGicon)
                            subItem.setIcon(image.thumbnailGicon);
                    });
                    
                    getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
                });
            }
            item.menu.openOld();
        };
        
        menu.addMenuItem(item);
        return item;
    },
    
    _addDrawingNameItem: function(menu) {
        this.drawingNameMenuItem = new PopupMenu.PopupMenuItem('', { reactive: false, activate: false });
        this.drawingNameMenuItem.setSensitive(false);
        getActor(this.drawingNameMenuItem).add_style_class_name('draw-on-your-screen-menu-ellipsized');
        menu.addMenuItem(this.drawingNameMenuItem);
        this._updateDrawingNameMenuItem();
    },
    
    _updateDrawingNameMenuItem: function() {
        getActor(this.drawingNameMenuItem).visible = this.area.currentJson ? true : false;
        if (this.area.currentJson) {
            let prefix = this.area.drawingContentsHasChanged ? "* " : "";
            this.drawingNameMenuItem.label.set_text(`<i>${prefix}${this.area.currentJson.name}</i>`);
            this.drawingNameMenuItem.label.get_clutter_text().set_use_markup(true);
        }
    },
    
    _addOpenDrawingSubMenuItem: function(menu, label, icon) {
        let item = new PopupMenu.PopupSubMenuMenuItem(label, true);
        this.openDrawingSubMenuItem = item;
        this.openDrawingSubMenu = item.menu;
        item.setSensitive(Boolean(Files.Jsons.getSorted().length));
        item.icon.set_icon_name(icon);
        
        item.menu.itemActivated = item.menu.close;
        item.menu.actor.add_style_class_name('draw-on-your-screen-menu-ellipsized');
        
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
        Files.Jsons.getSorted().forEach(json => {
            if (!json.gicon)
                json.addSvgContents(...this.area.getSvgContentsForJson(json));
            
            let subItem = this.openDrawingSubMenu.addAction(`<i>${String(json)}</i>`, () => {
                this.area.loadJson(json);
                this._updateDrawingNameMenuItem();
                this._updateActionSensitivity();
            }, Files.Icons.FAKE);
            
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (subItem.setIcon)
                    subItem.setIcon(json.gicon);
            });
            
            subItem.label.get_clutter_text().set_use_markup(true);
            getActor(subItem).connect('key-focus-in', updateSubMenuAdjustment);
            
            let expander = new St.Bin({
                style_class: 'popup-menu-item-expander',
                x_expand: true,
            });
            getActor(subItem).add_child(expander);
            
            let insertCallback = () => {
                this.area.currentImage = json.image;
                this.imageItem.update();
                this.area.currentTool = this.DrawingTool.IMAGE;
                this.toolItem.update();
                this._updateSectionVisibility();
            };
            let insertButton = new ActionButton(_("Add to images"), 'insert-image-symbolic', insertCallback, null, true);
            getActor(subItem).add_child(insertButton);
            
            let deleteCallback = () => {
                json.delete();
                subItem.destroy();
                this.openDrawingSubMenuItem.setSensitive(!this.openDrawingSubMenu.isEmpty());
            };
            let deleteButton = new ActionButton(_("Delete"), 'edit-delete-symbolic', deleteCallback, null, true);
            deleteButton.child.add_style_class_name('draw-on-your-screen-menu-destructive-button');
            getActor(subItem).add_child(deleteButton);
        });
        
        this.openDrawingSubMenuItem.setSensitive(!this.openDrawingSubMenu.isEmpty());
    },
    
    _addSaveDrawingSubMenuItem: function(menu, label, icon) {
        let item = new PopupMenu.PopupSubMenuMenuItem(label, true);
        this.saveDrawingSubMenuItem = item;
        this.saveDrawingSubMenu = item.menu;
        item.icon.set_icon_name(icon);
        
        item.menu.itemActivated = item.menu.close;
        
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
        let saveEntry = new Entry({ initialTextGetter: () => this.area.currentJson ? this.area.currentJson.name : "",
                                    hint_text: _("Type a name"),
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

// An action button that uses upstream dash item tooltips.
const ActionButton = new Lang.Class({
    Name: `${UUID}-DrawingMenuActionButton`,
    Extends: St.Bin,
    _labelShowing: false,
    _resetHoverTimeoutId: 0,
    _showLabelTimeoutId: 0,
    showLabel: Dash.DashItemContainer.prototype.showLabel,
    hideLabel: Dash.DashItemContainer.prototype.hideLabel,
    _syncLabel: Dash.Dash.prototype._syncLabel,
    
    _init: function(name, icon, callback, callbackAfter, inline) {
        this._labelText = name;
        
        let button = new St.Button({ track_hover: true,
                                     x_align: Clutter.ActorAlign.CENTER,
                                     accessible_name: name,
                                     style_class: `button draw-on-your-screen-menu-${inline ? 'inline' : 'action'}-button` });
        
        button.child = new St.Icon(typeof icon == 'string' ? { icon_name: icon } : { gicon: icon });
        if (inline)
            button.child.add_style_class_name('popup-menu-icon');
        
        button.connect('clicked', () => {
            callback();
            if (callbackAfter)
                callbackAfter();
        });
        button.bind_property('reactive', button, 'can_focus', GObject.BindingFlags.DEFAULT);
        button.connect('notify::hover', () => this._syncLabel(this));
        
        this.parent({ child: button, x_expand: inline ? false : true });
    },
    
    get label() {
        if (!this._label) {
            this._label = new St.Label({ style_class: 'dash-label' });
            Main.layoutManager.uiGroup.add_actor(this._label);
            this.connect('destroy', () => this._label.destroy());
        }
        
        return this._label;
    }
});

// based on searchItem.js, https://github.com/leonardo-bartoli/gnome-shell-extension-Recents
const Entry = new Lang.Class({
    Name: `${UUID}-DrawingMenuEntry`,
    
    _init: function(params) {
        this.params = params;
        this.item = new PopupMenu.PopupBaseMenuItem({ style_class: 'draw-on-your-screen-menu-entry-item',
                                                      activate: false,
                                                      reactive: true,
                                                      can_focus: false });
        
        this.itemActor = GS_VERSION < '3.33.0' ? this.item.actor : this.item;
        
        this.entry = new St.Entry({
            hint_text: params.hint_text || "",
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


