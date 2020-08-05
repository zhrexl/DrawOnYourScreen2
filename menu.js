/* jslint esversion: 6 */

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
const Area = Me.imports.area;
const Elements = Me.imports.elements;
const Extension = Me.imports.extension;
const Files = Me.imports.files;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const GS_VERSION = Config.PACKAGE_VERSION;

const ICON_DIR = Me.dir.get_child('data').get_child('icons');
const SMOOTH_ICON_PATH = ICON_DIR.get_child('smooth-symbolic.svg').get_path();
const COLOR_ICON_PATH = ICON_DIR.get_child('color-symbolic.svg').get_path();
const FILL_ICON_PATH = ICON_DIR.get_child('fill-symbolic.svg').get_path();
const STROKE_ICON_PATH = ICON_DIR.get_child('stroke-symbolic.svg').get_path();
const LINEJOIN_ICON_PATH = ICON_DIR.get_child('linejoin-symbolic.svg').get_path();
const LINECAP_ICON_PATH = ICON_DIR.get_child('linecap-symbolic.svg').get_path();
const FILLRULE_NONZERO_ICON_PATH = ICON_DIR.get_child('fillrule-nonzero-symbolic.svg').get_path();
const FILLRULE_EVENODD_ICON_PATH = ICON_DIR.get_child('fillrule-evenodd-symbolic.svg').get_path();
const DASHED_LINE_ICON_PATH = ICON_DIR.get_child('dashed-line-symbolic.svg').get_path();
const FULL_LINE_ICON_PATH = ICON_DIR.get_child('full-line-symbolic.svg').get_path();

const getActor = function(object) {
    return GS_VERSION < '3.33.0' ? object.actor : object;
};

var DrawingMenu = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingMenu',
    
    _init: function(area, monitor) {
        this.area = area;
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
        let groupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: "draw-on-your-screen-menu-group-item" });
        groupItem.add_child(this._createActionButton(_("Undo"), this.area.undo.bind(this.area), 'edit-undo-symbolic'));
        groupItem.add_child(this._createActionButton(_("Redo"), this.area.redo.bind(this.area), 'edit-redo-symbolic'));
        groupItem.add_child(this._createActionButton(_("Erase"), this.area.deleteLastElement.bind(this.area), 'edit-clear-all-symbolic'));
        groupItem.add_child(this._createActionButton(_("Smooth"), this.area.smoothLastElement.bind(this.area), this.smoothIcon));
        this.menu.addMenuItem(groupItem);
        this._addSeparator(this.menu, true);
        
        this._addSubMenuItem(this.menu, 'document-edit-symbolic', Area.ToolNames, this.area, 'currentTool', this._updateSectionVisibility.bind(this));
        this.colorItem = this._addColorSubMenuItem(this.menu);
        this.fillItem = this._addSwitchItem(this.menu, _("Fill"), this.strokeIcon, this.fillIcon, this.area, 'fill', this._updateSectionVisibility.bind(this));
        this.fillSection = new PopupMenu.PopupMenuSection();
        this.fillSection.itemActivated = () => {};
        this.fillRuleItem = this._addSwitchItem(this.fillSection, _("Evenodd"), this.fillRuleNonzeroIcon, this.fillRuleEvenoddIcon, this.area, 'currentEvenodd');
        this.menu.addMenuItem(this.fillSection);
        this._addSeparator(this.menu);
        
        let lineSection = new PopupMenu.PopupMenuSection();
        this._addSliderItem(lineSection, this.area, 'currentLineWidth');
        this._addSubMenuItem(lineSection, this.linejoinIcon, Elements.LineJoinNames, this.area, 'currentLineJoin');
        this._addSubMenuItem(lineSection, this.linecapIcon, Elements.LineCapNames, this.area, 'currentLineCap');
        this._addSwitchItem(lineSection, _("Dashed"), this.fullLineIcon, this.dashedLineIcon, this.area, 'dashedLine');
        this._addSeparator(lineSection);
        this.menu.addMenuItem(lineSection);
        lineSection.itemActivated = () => {};
        this.lineSection = lineSection;
        
        let fontSection = new PopupMenu.PopupMenuSection();
        let FontGenericNamesCopy = Object.create(Area.FontGenericNames);
        FontGenericNamesCopy[0] = this.area.currentThemeFontFamily;
        this._addSubMenuItem(fontSection, 'font-x-generic-symbolic', FontGenericNamesCopy, this.area, 'currentFontGeneric');
        this._addSubMenuItem(fontSection, 'format-text-bold-symbolic', Elements.FontWeightNames, this.area, 'currentFontWeight');
        this._addSubMenuItem(fontSection, 'format-text-italic-symbolic', Elements.FontStyleNames, this.area, 'currentFontStyle');
        this._addSwitchItem(fontSection, _("Right aligned"), 'format-justify-left-symbolic', 'format-justify-right-symbolic', this.area, 'currentTextRightAligned');
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
        
        let manager = Extension.manager;
        this._addSimpleSwitchItem(this.menu, _("Hide panel and dock"), manager.hiddenList ? true : false, manager.togglePanelAndDockOpacity.bind(manager));
        this._addSimpleSwitchItem(this.menu, _("Add a drawing background"), this.area.hasBackground, this.area.toggleBackground.bind(this.area));
        this._addSimpleSwitchItem(this.menu, _("Add a grid overlay"), this.area.hasGrid, this.area.toggleGrid.bind(this.area));
        this._addSimpleSwitchItem(this.menu, _("Square drawing area"), this.area.isSquareArea, this.area.toggleSquareArea.bind(this.area));
        this._addSeparator(this.menu);
        
        this._addDrawingNameItem(this.menu);
        this._addOpenDrawingSubMenuItem(this.menu);
        this._addSaveDrawingSubMenuItem(this.menu);
        
        this.menu.addAction(_("Save drawing as a SVG file"), this.area.saveAsSvg.bind(this.area), 'image-x-generic-symbolic');
        this.menu.addAction(_("Edit style"), manager.openUserStyleFile.bind(manager), 'document-page-setup-symbolic');
        this.menu.addAction(_("Show help"), () => { this.close(); this.area.toggleHelp(); }, 'preferences-desktop-keyboard-shortcuts-symbolic');
        
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
        smoothButton.reactive = this.area.elements.length > 0 && this.area.elements[this.area.elements.length - 1].shape == Area.Tools.NONE;
    },
    
    _updateSectionVisibility: function() {
        let [isText, isImage] = [this.area.currentTool == Area.Tools.TEXT, this.area.currentTool == Area.Tools.IMAGE];
        this.lineSection.actor.visible = !isText && !isImage;
        this.fontSection.actor.visible = isText;
        this.imageSection.actor.visible = isImage;
        this.colorItem.setSensitive(!isImage);
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
        let label = new St.Label({ text: _("%d px").format(target[targetProperty]), style_class: 'draw-on-your-screen-menu-slider-label' });
        let slider = new Slider.Slider(target[targetProperty] / 50);
        
        if (GS_VERSION < '3.33.0') {
            slider.connect('value-changed', (slider, value, property) => {
                target[targetProperty] = Math.max(Math.round(value * 50), 0);
                label.set_text(target[targetProperty] + " px");
                if (target[targetProperty] === 0)
                    label.add_style_class_name(Extension.WARNING_COLOR_STYLE_CLASS_NAME);
                else
                    label.remove_style_class_name(Extension.WARNING_COLOR_STYLE_CLASS_NAME);
            });
        } else {
            slider.connect('notify::value', () => {
                target[targetProperty] = Math.max(Math.round(slider.value * 50), 0);
                label.set_text(target[targetProperty] + " px");
                if (target[targetProperty] === 0)
                    label.add_style_class_name(Extension.WARNING_COLOR_STYLE_CLASS_NAME);
                else
                    label.remove_style_class_name(Extension.WARNING_COLOR_STYLE_CLASS_NAME);
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
        let item = new PopupMenu.PopupSubMenuMenuItem(_(String(obj[target[targetProperty]])), icon ? true : false);
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
                if (targetProperty == 'currentFontGeneric')
                    text = `<span font_family="${obj[i]}">${_(obj[i])}</span>`;
                else if (targetProperty == 'currentFontWeight')
                    text = `<span font_weight="${i}">${_(obj[i])}</span>`;
                else if (targetProperty == 'currentFontStyle')
                    text = `<span font_style="${obj[i].toLowerCase()}">${_(obj[i])}</span>`;
                else
                    text = _(String(obj[i]));
                
                let iCaptured = Number(i);
                let subItem = item.menu.addAction(text, () => {
                    item.label.set_text(_(String(obj[iCaptured])));
                    target[targetProperty] = iCaptured;
                    if (targetProperty == 'currentImage')
                        item.icon.set_gicon(obj[iCaptured].gicon);
                    if (callback)
                        callback();
                });
                
                subItem.label.get_clutter_text().set_use_markup(true);
                
                // change the display order of tools
                if (obj == Area.ToolNames && i == Area.Tools.POLYGON)
                    item.menu.moveMenuItem(subItem, 4);
                else if (obj == Area.ToolNames && i == Area.Tools.POLYLINE)
                    item.menu.moveMenuItem(subItem, 5);
            }
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
    },
    
    _addColorSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_("Color"), true);
        item.icon.set_gicon(this.colorIcon);
        item.icon.set_style(`color:${this.area.currentColor.to_string().slice(0, 7)};`);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            for (let i = 1; i < this.area.colors.length; i++) {
                let text = this.area.colors[i].to_string();
                let iCaptured = i;
                let colorItem = item.menu.addAction(text, () => {
                    this.area.currentColor = this.area.colors[iCaptured];
                    item.icon.set_style(`color:${this.area.currentColor.to_string().slice(0, 7)};`);
                });
                colorItem.label.get_clutter_text().set_use_markup(true);
                // Foreground color markup is not displayed since 3.36, use style instead but the transparency is lost.
                colorItem.label.set_style(`color:${this.area.colors[i].to_string().slice(0, 7)};`);
            }
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
        return item;
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
            let item = this.openDrawingSubMenu.addAction(`<i>${String(json)}</i>`, () => {
                this.area.loadJson(json.name);
                this._updateDrawingNameMenuItem();
                this._updateSaveDrawingSubMenuItemSensitivity();
            });
            item.label.get_clutter_text().set_use_markup(true);
            
            let expander = new St.Bin({
                style_class: 'popup-menu-item-expander',
                x_expand: true,
            });
            getActor(item).add_child(expander);
            
            let deleteButton = new St.Button({ style_class: 'draw-on-your-screen-menu-delete-button',
                                               child: new St.Icon({ icon_name: 'edit-delete-symbolic',
                                                                    style_class: 'popup-menu-icon',
                                                                    x_align: Clutter.ActorAlign.END }) });
            getActor(item).add_child(deleteButton);
            
            deleteButton.connect('clicked', () => {
                json.delete();
                item.destroy();
            });
        });
        
        this.openDrawingSubMenuItem.setSensitive(!this.openDrawingSubMenu.isEmpty());
    },
    
    _addSaveDrawingSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_("Save drawing"), true);
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
    
    _populateSaveDrawingSubMenu: function() {
        this.saveDrawingSubMenu.removeAll();
        let saveEntry = new DrawingMenuEntry({ initialTextGetter: Files.getDateString,
                                                entryActivateCallback: (text) => {
                                                    this.area.saveAsJsonWithName(text);
                                                    this.saveDrawingSubMenu.toggle();
                                                    this._updateDrawingNameMenuItem();
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


