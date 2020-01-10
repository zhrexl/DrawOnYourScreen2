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

const Cairo = imports.cairo;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const BoxPointer = imports.ui.boxpointer;
const Config = imports.misc.config;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const Screenshot = imports.ui.screenshot;
const Tweener = imports.ui.tweener;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings ? ExtensionUtils : Me.imports.convenience;
const Extension = Me.imports.extension;
const Prefs = Me.imports.prefs;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const GS_VERSION = Config.PACKAGE_VERSION;

const FILL_ICON_PATH = Me.dir.get_child('data').get_child('icons').get_child('fill-symbolic.svg').get_path();
const STROKE_ICON_PATH = Me.dir.get_child('data').get_child('icons').get_child('stroke-symbolic.svg').get_path();
const LINEJOIN_ICON_PATH = Me.dir.get_child('data').get_child('icons').get_child('linejoin-symbolic.svg').get_path();
const LINECAP_ICON_PATH = Me.dir.get_child('data').get_child('icons').get_child('linecap-symbolic.svg').get_path();
const DASHED_LINE_ICON_PATH = Me.dir.get_child('data').get_child('icons').get_child('dashed-line-symbolic.svg').get_path();
const FULL_LINE_ICON_PATH = Me.dir.get_child('data').get_child('icons').get_child('full-line-symbolic.svg').get_path();

var Shapes = { NONE: 0, LINE: 1, ELLIPSE: 2, RECTANGLE: 3, TEXT: 4 };
var TextState = { DRAWING: 0, WRITING: 1 };
var ShapeNames = { 0: "Free drawing", 1: "Line", 2: "Ellipse", 3: "Rectangle", 4: "Text" };
var LineCapNames = { 0: 'Butt', 1: 'Round', 2: 'Square' };
var LineJoinNames = { 0: 'Miter', 1: 'Round', 2: 'Bevel' };
var FontWeightNames = { 0: 'Normal', 1: 'Bold' };
var FontStyleNames = { 0: 'Normal', 1: 'Italic', 2: 'Oblique' };
var FontFamilyNames = {  0: 'Default', 1: 'Sans-Serif', 2: 'Serif', 3: 'Monospace', 4: 'Cursive', 5: 'Fantasy' };

function getDateString() {
    let date = GLib.DateTime.new_now_local();
    return `${date.format("%F")} ${date.format("%X")}`;
}

function getJsonFiles() {
    let directory = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]));
    if (!directory.query_exists(null))
        return [];
    
    let jsonFiles = [];
    let enumerator;
    try {
        enumerator = directory.enumerate_children('standard::name,standard::display-name,standard::content-type,time::modified', Gio.FileQueryInfoFlags.NONE, null);
    } catch(e) {
        return [];
    }
    
    let i = 0;
    let fileInfo = enumerator.next_file(null);
    while (fileInfo) {
        if (fileInfo.get_content_type().indexOf('json') != -1 && fileInfo.get_name() != `${Me.metadata['persistent-file-name']}.json`) {
            let file = enumerator.get_child(fileInfo);
            jsonFiles.push({ name: fileInfo.get_name().slice(0, -5),
                             displayName: fileInfo.get_display_name().slice(0, -5),
                             modificationDateTime: fileInfo.get_modification_date_time(),
                             delete: () => file.delete(null) });
        }
        fileInfo = enumerator.next_file(null);
    }
    enumerator.close(null);
    
    jsonFiles.sort((a, b) => {
        return a.modificationDateTime.difference(b.modificationDateTime);
    });
    
    return jsonFiles;
}

// DrawingArea is the widget in which we draw, thanks to Cairo.
// It creates and manages a DrawingElement for each "brushstroke".
// It handles pointer/mouse/(touch?) events and some keyboard events.
var DrawingArea = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingArea',
    Extends: St.DrawingArea,
    Signals: { 'show-osd': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_DOUBLE] },
               'stop-drawing': {} },

    _init: function(params, monitor, helper, loadPersistent) {
        this.parent({ style_class: 'draw-on-your-screen', name: params && params.name ? params.name : ""});
        
        this.connect('repaint', this._repaint.bind(this));
        
        this.settings = Convenience.getSettings();
        this.monitor = monitor;
        this.helper = helper;
        
        this.elements = [];
        this.undoneElements = [];
        this.currentElement = null;
        this.currentShape = Shapes.NONE;
        this.isSquareArea = false;
        this.hasBackground = false;
        this.textHasCursor = false;
        this.dashedLine = false;
        this.fill = false;
        this.colors = [Clutter.Color.new(0, 0, 0, 255)];
        
        if (loadPersistent)
            this._loadPersistent();
    },
    
    get menu() {
        if (!this._menu)
            this._menu = new DrawingMenu(this, this.monitor);
        return this._menu;
    },
    
    _redisplay: function() {
        // force area to emit 'repaint'
        this.queue_repaint();
    },
    
    _updateStyle: function() {
        try {
            let themeNode = this.get_theme_node();
            for (let i = 1; i < 10; i++) {
                this.colors[i] = themeNode.get_color('-drawing-color' + i);
            }
            this.activeBackgroundColor = themeNode.get_color('-drawing-background-color');
            this.currentLineWidth = themeNode.get_length('-drawing-line-width');
            this.currentLineJoin = themeNode.get_double('-drawing-line-join');
            this.currentLineCap = themeNode.get_double('-drawing-line-cap');
            this.dashArray = [themeNode.get_length('-drawing-dash-array-on'), themeNode.get_length('-drawing-dash-array-off')];
            this.dashOffset = themeNode.get_length('-drawing-dash-offset');
            let font = themeNode.get_font();
            this.fontFamily = font.get_family();
            this.currentFontWeight = font.get_weight();
            this.currentFontStyle = font.get_style();
        } catch(e) {
            logError(e);
        }
        
        for (let i = 1; i < 10; i++) {
            this.colors[i] = this.colors[i].alpha ? this.colors[i] : this.colors[0];
        }
        this.currentColor = this.colors[1];
        
        this.currentLineWidth = (this.currentLineWidth > 0) ? this.currentLineWidth : 3;
        this.currentLineJoin = ([0, 1, 2].indexOf(this.currentLineJoin) != -1) ? this.currentLineJoin : Cairo.LineJoin.ROUND;
        this.currentLineCap = ([0, 1, 2].indexOf(this.currentLineCap) != -1) ? this.currentLineCap : Cairo.LineCap.ROUND;
        this.currentFontFamilyId = 0;
        this.currentFontWeight = this.currentFontWeight > 500 ? 1 : 0 ;
        // font style enum order of Cairo and Pango are different
        this.currentFontStyle = this.currentFontStyle == 2 ? 1 : ( this.currentFontStyle == 1 ? 2 : 0);
    },
    
    _repaint: function(area) {
        let cr = area.get_context();
        
        for (let i = 0; i < this.elements.length; i++) {
            let isStraightLine = this.elements[i].shape == Shapes.LINE &&
                                (this.elements[i].points.length < 3 || this.elements[i].points[2] == this.elements[i].points[1] || this.elements[i].points[2] == this.elements[i].points[0]);
            
            if (this.elements[i].fill && !isStraightLine) {
                // first paint stroke
                this.elements[i].buildCairo(cr, false);
                if (this.elements[i].shape == Shapes.NONE || this.elements[i].shape == Shapes.LINE)
                    cr.closePath();
                cr.stroke();
                // secondly paint fill
                this.elements[i].buildCairo(cr, false);
                cr.fill();
            } else {
                this.elements[i].buildCairo(cr, false);
                cr.stroke();
            }
        }
        
        if (this.currentElement) {
            this.currentElement.buildCairo(cr, this.textHasCursor);
            cr.stroke();
        }
        
        cr.$dispose();
    },
    
    _onButtonPressed: function(actor, event) {
        let button = event.get_button();
        let [x, y] = event.get_coords();
        let shiftPressed = event.has_shift_modifier();
        
        // stop writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.currentElement.state == TextState.WRITING ) {
            this._stopWriting();
        }
        
        // hide helper
        if (this.helper.visible) {
            this.helper.hideHelp();
            return Clutter.EVENT_STOP;
        }
        
        if (button == 1) {
            this._startDrawing(x, y, shiftPressed);
            return Clutter.EVENT_STOP;
        } else if (button == 2) {
            this.toggleFill();
        } else if (button == 3) {
            this._stopDrawing();
            this.menu.open(x, y);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    },
    
    _onKeyboardPopupMenu: function() {
        this._stopDrawing();
        if (this.helper.visible)
            this.helper.hideHelp();
        this.menu.popup();
        return Clutter.EVENT_STOP;
    },
    
    _onKeyPressed: function(actor, event) {
        if (event.get_key_symbol() == Clutter.Escape) {
            this.emit('stop-drawing');
            return Clutter.EVENT_STOP;
            
        } else if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.currentElement.state == TextState.WRITING) {
            if (event.get_key_symbol() == Clutter.KEY_BackSpace) {
                this.currentElement.text = this.currentElement.text.slice(0, -1);
                this._updateCursorTimeout();
            } else if (event.has_control_modifier() && event.get_key_symbol() == 118) {
            // Ctrl + V
                St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipBoard, clipText) => {
                    this.currentElement.text += clipText;
                    this._updateCursorTimeout();
                    this._redisplay();
                });
                return Clutter.EVENT_STOP;
            } else if (event.get_key_symbol() == Clutter.KEY_Return || event.get_key_symbol() == 65421) {
            // stop writing
            // Clutter.KEY_Return is "Enter" and 65421 is KP_Enter
                this._stopWriting();
            } else if (event.has_control_modifier()){
            // it's a shortcut, do not write text
                return Clutter.EVENT_PROPAGATE;
            } else {
                let unicode = event.get_key_unicode();
                this.currentElement.text += unicode;
                this._updateCursorTimeout();
            }
            this._redisplay();
            return Clutter.EVENT_STOP;
            
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
    },
    
    _onScroll: function(actor, event) {
        if (this.helper.visible)
            return Clutter.EVENT_PROPAGATE;
        let direction = event.get_scroll_direction();
        if (direction == Clutter.ScrollDirection.UP)
             this.incrementLineWidth(1);
        else if (direction == Clutter.ScrollDirection.DOWN)
            this.incrementLineWidth(-1);
        else
            return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    },
    
    _startDrawing: function(stageX, stageY, eraser) {
        let [success, startX, startY] = this.transform_stage_point(stageX, stageY);
        
        if (!success)
            return;
        
        this.buttonReleasedHandler = this.connect('button-release-event', (actor, event) => {
            this._stopDrawing();
        });
        
        this.currentElement = new DrawingElement ({
            shape: this.currentShape,
            color: this.currentColor.to_string(),
            line: { lineWidth: this.currentLineWidth, lineJoin: this.currentLineJoin, lineCap: this.currentLineCap },
            dash: { array: this.dashedLine ? this.dashArray : [0, 0] , offset: this.dashedLine ? this.dashOffset : 0 },
            fill: this.fill,
            eraser: eraser,
            transform: { active: false, center: [0, 0], angle: 0, startAngle: 0, ratio: 1 },
            text: '',
            font: { family: (this.currentFontFamilyId == 0 ? this.fontFamily : FontFamilyNames[this.currentFontFamilyId]), weight: this.currentFontWeight, style: this.currentFontStyle },
            points: [[startX, startY]]
        });
        
        if (this.currentShape == Shapes.TEXT) {
            this.currentElement.line = { lineWidth: 1, lineJoin: 0, lineCap: 0 };
            this.currentElement.dash = { array: [1, 1] , offset: 0 };
            this.currentElement.fill = false;
            this.currentElement.text = _("Text");
            this.currentElement.state = TextState.DRAWING;
        }
        
        this.motionHandler = this.connect('motion-event', (actor, event) => {
            let coords = event.get_coords();
            let [s, x, y] = this.transform_stage_point(coords[0], coords[1]);
            if (!s)
                return;
            let controlPressed = event.has_control_modifier();
            this._updateDrawing(x, y, controlPressed);
        });
    },
    
    _stopDrawing: function() {
        if (this.motionHandler) {
            this.disconnect(this.motionHandler);
            this.motionHandler = null;
        }
        if (this.buttonReleasedHandler) {
            this.disconnect(this.buttonReleasedHandler);
            this.buttonReleasedHandler = null;
        }
        
        // skip when the size is too small to be visible (3px) (except for free drawing)
        if (this.currentElement && this.currentElement.points.length >= 2 &&
            (this.currentShape == Shapes.NONE ||
                Math.hypot(this.currentElement.points[1][0] - this.currentElement.points[0][0], this.currentElement.points[1][1] - this.currentElement.points[0][1]) > 3)) {
            
            // start writing
            if (this.currentElement.shape == Shapes.TEXT && this.currentElement.state == TextState.DRAWING) {
                this.currentElement.state = TextState.WRITING;
                this.currentElement.text = '';
                this.emit('show-osd', null, _("Type your text\nand press Enter"), -1);
                this._updateCursorTimeout();
                this.textHasCursor = true;
                this._redisplay();
                this.updatePointerCursor();
                return;
            }
        
            this.elements.push(this.currentElement);
        }
        
        this.currentElement = null;
        this._redisplay();
        this.updatePointerCursor();
    },
    
    _updateDrawing: function(x, y, controlPressed) {
        if (!this.currentElement)
            return;
        if (this.currentElement.shape == Shapes.NONE)
            this.currentElement.addPoint(x, y, controlPressed);
        else if ((this.currentElement.shape == Shapes.RECTANGLE || this.currentElement.shape == Shapes.TEXT) && (controlPressed || this.currentElement.transform.active))
            this.currentElement.transformRectangle(x, y);
        else if (this.currentElement.shape == Shapes.ELLIPSE && (controlPressed || this.currentElement.transform.active))
            this.currentElement.transformEllipse(x, y);
        else if (this.currentElement.shape == Shapes.LINE && (controlPressed || this.currentElement.transform.active))
            this.currentElement.transformLine(x, y);
        else
            this.currentElement.points[1] = [x, y];
        
        this._redisplay();
        this.updatePointerCursor(controlPressed);
    },
    
    _stopWriting: function() {
        if (this.currentElement.text.length > 0)
            this.elements.push(this.currentElement);
        this.currentElement = null;
        this._stopCursorTimeout();
        this._redisplay();
    },
    
    setPointerCursor: function(pointerCursorName) {
        if (!this.currentPointerCursorName || this.currentPointerCursorName != pointerCursorName) {
            this.currentPointerCursorName = pointerCursorName;
            Extension.setCursor(pointerCursorName);
        }
    },
    
    updatePointerCursor: function(controlPressed) {
        if (!this.currentElement || (this.currentElement.shape == Shapes.TEXT && this.currentElement.state == TextState.WRITING))
            this.setPointerCursor(this.currentShape == Shapes.NONE ? 'POINTING_HAND' : 'CROSSHAIR');
        else if (this.currentElement.shape != Shapes.NONE && controlPressed)
            this.setPointerCursor('MOVE_OR_RESIZE_WINDOW');
    },
    
    _stopCursorTimeout: function() {
        if (this.cursorTimeoutId) {
            Mainloop.source_remove(this.cursorTimeoutId);
            this.cursorTimeoutId = null;
        }
        this.textHasCursor = false;
    },
    
    _updateCursorTimeout: function() {
        this._stopCursorTimeout();
        this.cursorTimeoutId = Mainloop.timeout_add(600, () => {
            this.textHasCursor = !this.textHasCursor;
            this._redisplay();
            return GLib.SOURCE_CONTINUE;
        });
    },
    
    erase: function() {
        this.elements = [];
        this.undoneElements = [];
        this.currentElement = null;
        this._redisplay();
    },
    
    deleteLastElement: function() {
        if (this.currentElement) {
            if (this.motionHandler) {
                this.disconnect(this.motionHandler);
                this.motionHandler = null;
            }
            if (this.buttonReleasedHandler) {
                this.disconnect(this.buttonReleasedHandler);
                this.buttonReleasedHandler = null;
            }
            this.currentElement = null;
            this._stopCursorTimeout();
        } else {
            this.elements.pop();
        }
        this._redisplay();
    },
    
    undo: function() {
        if (this.elements.length > 0)
            this.undoneElements.push(this.elements.pop());
        this._redisplay();
    },
    
    redo: function() {
        if (this.undoneElements.length > 0)
            this.elements.push(this.undoneElements.pop());
        this._redisplay();
    },
    
    smoothLastElement: function() {
        if (this.elements.length > 0 && this.elements[this.elements.length - 1].shape == Shapes.NONE) {
            this.elements[this.elements.length - 1].smoothAll();
            this._redisplay();
        }
    },
    
    toggleBackground: function() {
        this.hasBackground = !this.hasBackground;
        this.get_parent().set_background_color(this.hasBackground ? this.activeBackgroundColor : null);
    },
    
    toggleSquareArea: function() {
        this.isSquareArea = !this.isSquareArea;
        if (this.isSquareArea) {
            let squareWidth = Math.min(this.monitor.width, this.monitor.height) * 3 / 4;
            this.set_position(Math.floor(this.monitor.width / 2 - squareWidth / 2), Math.floor(this.monitor.height / 2 - squareWidth / 2));
            this.set_size(squareWidth, squareWidth);
            this.add_style_class_name('draw-on-your-screen-square-area');
        } else {
            this.set_position(0, 0);
            this.set_size(this.monitor.width, this.monitor.height);
            this.remove_style_class_name('draw-on-your-screen-square-area');
        }
    },
    
    toggleColor: function() {
        this.selectColor((this.currentColor == this.colors[1]) ? 2 : 1);
    },
    
    selectColor: function(index) {
        this.currentColor = this.colors[index];
        if (this.currentElement) {
            this.currentElement.color = this.currentColor.to_string();
            this._redisplay();
        }
        this.emit('show-osd', null, `<span foreground="${this.currentColor.to_string()}">${this.currentColor.to_string()}</span>`, -1);
    },
    
    selectShape: function(shape) {
        this.currentShape = shape;
        this.emit('show-osd', null, _(ShapeNames[shape]), -1);
        this.updatePointerCursor();
    },
    
    toggleFill: function() {
        this.fill = !this.fill;
        this.emit('show-osd', null, this.fill ? _("Fill") : _("Stroke"), -1);
    },
    
    toggleDash: function() {
        this.dashedLine = !this.dashedLine;
        this.emit('show-osd', null, this.dashedLine ? _("Dashed line") : _("Full line"), -1);
    },
    
    incrementLineWidth: function(increment) {
        this.currentLineWidth = Math.max(this.currentLineWidth + increment, 0);
        this.emit('show-osd', null, this.currentLineWidth + " " + _("px"), 2 * this.currentLineWidth);
    },
    
    toggleLineJoin: function() {
        this.currentLineJoin = this.currentLineJoin == 2 ? 0 : this.currentLineJoin + 1;
        this.emit('show-osd', null, _(LineJoinNames[this.currentLineJoin]), -1);
    },
    
    toggleLineCap: function() {
        this.currentLineCap = this.currentLineCap == 2 ? 0 : this.currentLineCap + 1;
        this.emit('show-osd', null, _(LineCapNames[this.currentLineCap]), -1);
    },
    
    toggleFontWeight: function() {
        this.currentFontWeight = this.currentFontWeight == 1 ? 0 : this.currentFontWeight + 1;
        if (this.currentElement) {
            this.currentElement.font.weight = this.currentFontWeight;
            this._redisplay();
        }
        this.emit('show-osd', null, `<span font_weight="${FontWeightNames[this.currentFontWeight].toLowerCase()}">${_(FontWeightNames[this.currentFontWeight])}</span>`, -1);
    },
    
    toggleFontStyle: function() {
        this.currentFontStyle = this.currentFontStyle == 2 ? 0 : this.currentFontStyle + 1;
        if (this.currentElement) {
            this.currentElement.font.style = this.currentFontStyle;
            this._redisplay();
        }
        this.emit('show-osd', null, `<span font_style="${FontStyleNames[this.currentFontStyle].toLowerCase()}">${_(FontStyleNames[this.currentFontStyle])}</span>`, -1);
    },
    
    toggleFontFamily: function() {
        this.currentFontFamilyId = this.currentFontFamilyId == 5 ? 0 : this.currentFontFamilyId + 1;
        let currentFontFamily = this.currentFontFamilyId == 0 ? this.fontFamily : FontFamilyNames[this.currentFontFamilyId];
        if (this.currentElement) {
            this.currentElement.font.family = currentFontFamily;
            this._redisplay();
        }
        this.emit('show-osd', null, `<span font_family="${currentFontFamily}">${_(currentFontFamily)}</span>`, -1);
    },
    
    toggleHelp: function() {
        if (this.helper.visible)
            this.helper.hideHelp();
        else
            this.helper.showHelp();
    },
    
    enterDrawingMode: function() {
        this.keyPressedHandler = this.connect('key-press-event', this._onKeyPressed.bind(this));        
        this.buttonPressedHandler = this.connect('button-press-event', this._onButtonPressed.bind(this));
        this._onKeyboardPopupMenuHandler = this.connect('popup-menu', this._onKeyboardPopupMenu.bind(this));
        this.scrollHandler = this.connect('scroll-event', this._onScroll.bind(this));
        this.get_parent().set_background_color(this.hasBackground ? this.activeBackgroundColor : null);
        this._updateStyle();
    },
    
    leaveDrawingMode: function(save) {
        if (this.keyPressedHandler) {
            this.disconnect(this.keyPressedHandler);
            this.keyPressedHandler = null;
        }
        if (this.buttonPressedHandler) {
            this.disconnect(this.buttonPressedHandler);
            this.buttonPressedHandler = null;
        }
        if (this._onKeyboardPopupMenuHandler) {
            this.disconnect(this._onKeyboardPopupMenuHandler);
            this._onKeyboardPopupMenuHandler = null;
        }
        if (this.motionHandler) {
            this.disconnect(this.motionHandler);
            this.motionHandler = null;
        }
        if (this.buttonReleasedHandler) {
            this.disconnect(this.buttonReleasedHandler);
            this.buttonReleasedHandler = null;
        }
        if (this.scrollHandler) {
            this.disconnect(this.scrollHandler);
            this.scrollHandler = null;
        }
        
        if (this.helper.visible)
            this.helper.hideHelp();
        
        this.currentElement = null;
        this._stopCursorTimeout();
        this.currentShape = Shapes.NONE;
        this.dashedLine = false;
        this.fill = false;
        this._redisplay();
        if (this._menu)
            this._menu.close();
        this.get_parent().set_background_color(null);
        if (save)
            this.savePersistent();
    },
    
    saveAsSvg: function() {
        // stop drawing or writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.currentElement.state == TextState.WRITING) {
            this._stopWriting();
        } else if (this.currentElement && this.currentElement.shape != Shapes.TEXT) {
            this._stopDrawing();
        }
        
        let content = `<svg viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">`;
        let backgroundColorString = this.hasBackground ? this.activeBackgroundColor.to_string() : 'transparent';
        if (backgroundColorString != 'transparent') {
            content += `\n  <rect id="background" width="100%" height="100%" fill="${backgroundColorString}"/>`;
        }
        for (let i = 0; i < this.elements.length; i++) {
            content += this.elements[i].buildSVG(backgroundColorString);
        }
        content += "\n</svg>";
        
        let filename = `${Me.metadata['svg-file-name']} ${getDateString()}.svg`;
        let dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        let path = GLib.build_filenamev([dir, filename]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return false;
        let success = GLib.file_set_contents(path, content);
        
        if (success) {
            // pass the parent (bgContainer) to Flashspot because coords of this are relative
            let flashspot = new Screenshot.Flashspot(this.get_parent());
            flashspot.fire();
            if (global.play_theme_sound) {
                global.play_theme_sound(0, 'screen-capture', "Save as SVG", null);
            } else if (global.display && global.display.get_sound_player) {
                let player = global.display.get_sound_player();
                player.play_from_theme('screen-capture', "Save as SVG", null);
            }
        }
    },
    
    _saveAsJson: function(name, notify) {
        // stop drawing or writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.currentElement.state == TextState.WRITING) {
            this._stopWriting();
        } else if (this.currentElement && this.currentElement.shape != Shapes.TEXT) {
            this._stopDrawing();
        }
        
        let dir = GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]);
        if (!GLib.file_test(dir, GLib.FileTest.EXISTS))
            GLib.mkdir_with_parents(dir, 0o700);
        let path = GLib.build_filenamev([dir, `${name}.json`]);
        
        let oldContents;
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            oldContents = GLib.file_get_contents(path)[1];
            if (oldContents instanceof Uint8Array)
                oldContents = imports.byteArray.toString(oldContents);
        }
        
        // do not create a file to write just an empty array
        if (!oldContents && this.elements.length == 0)
            return;
        
        // do not use "content = JSON.stringify(this.elements, null, 2);", neither "content = JSON.stringify(this.elements);"
        // because of compromise between disk usage and human readability
        let contents = `[\n  ` + new Array(...this.elements.map(element => JSON.stringify(element))).join(`,\n\n  `) + `\n]`;
        
        if (contents != oldContents) {
            GLib.file_set_contents(path, contents);
            if (notify)
                this.emit('show-osd', 'document-save-symbolic', name, -1);
            if (name != Me.metadata['persistent-file-name']) {
                this.jsonName = name;
                this.lastJsonContents = contents;
            }
        }
    },
    
    saveAsJsonWithName: function(name) {
        this._saveAsJson(name);
    },
    
    saveAsJson: function() {
        this._saveAsJson(getDateString(), true);
    },
    
    savePersistent: function() {
        this._saveAsJson(Me.metadata['persistent-file-name']);
    },
    
    _loadJson: function(name, notify) {
        let dir = GLib.get_user_data_dir();
        let path = GLib.build_filenamev([dir, Me.metadata['data-dir'], `${name}.json`]);
        
        if (!GLib.file_test(path, GLib.FileTest.EXISTS))
            return;
        let [success, contents] = GLib.file_get_contents(path);
        if (!success)
            return;
        if (contents instanceof Uint8Array)
            contents = imports.byteArray.toString(contents);
        this.elements.push(...JSON.parse(contents).map(object => new DrawingElement(object)));
        
        if (notify)
            this.emit('show-osd', 'document-open-symbolic', name, -1);
        if (name != Me.metadata['persistent-file-name']) {
            this.jsonName = name;
            this.lastJsonContents = contents;
        }
    },
    
    _loadPersistent: function() {
        this._loadJson(Me.metadata['persistent-file-name']);
    },
    
    loadJson: function(name, notify) {
        this.elements = [];
        this.currentElement = null;
        this._stopCursorTimeout();
        this._loadJson(name, notify);
        this._redisplay();
    },
    
    loadNextJson: function() {
        let names = getJsonFiles().map(file => file.name);
        
        if (!names.length)
            return;
        
        let nextName = names[this.jsonName && names.indexOf(this.jsonName) != names.length - 1 ? names.indexOf(this.jsonName) + 1 : 0];
        this.loadJson(nextName, true);
    },
    
    loadPreviousJson: function() {
        let names = getJsonFiles().map(file => file.name);
        
        if (!names.length)
            return;
        
        let previousName = names[this.jsonName && names.indexOf(this.jsonName) > 0 ? names.indexOf(this.jsonName) - 1 : names.length - 1];
        this.loadJson(previousName, true);
    },
    
    get drawingContentsHasChanged() {
        let contents = `[\n  ` + new Array(...this.elements.map(element => JSON.stringify(element))).join(`,\n\n  `) + `\n]`;
        return contents != this.lastJsonContents;
    },
    
    disable: function() {
        this.erase();
        this.menu.disable();
    }
});

// DrawingElement represents a "brushstroke".
// It can be converted into a cairo path as well as a svg element.
// See DrawingArea._startDrawing() to know its params.
var DrawingElement = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingElement',
    
    _init: function(params) {
        for (let key in params)
            this[key] = params[key];
    },
    
    // toJSON is called by JSON.stringify
    toJSON: function() {
        return {
            shape: this.shape,
            color: this.color,
            line: this.line,
            dash: this.dash,
            fill: this.fill,
            eraser: this.eraser,
            transform: this.transform,
            text: this.text,
            font: this.font,
            points: this.points.map((point) => [Math.round(point[0]*100)/100, Math.round(point[1]*100)/100])
        };
    },
    
    buildCairo: function(cr, showTextCursor) {
        cr.setLineCap(this.line.lineCap);
        cr.setLineJoin(this.line.lineJoin);
        cr.setLineWidth(this.line.lineWidth);
        
        if (this.dash.array[0] > 0 && this.dash.array[1] > 0)
            cr.setDash(this.dash.array, this.dash.offset);
        else
            cr.setDash([1000000], 0);
        
        if (this.eraser)
            cr.setOperator(Cairo.Operator.CLEAR);
        else
            cr.setOperator(Cairo.Operator.OVER);
        
        let [success, color] = Clutter.Color.from_string(this.color);
        if (success)
            Clutter.cairo_set_source_color(cr, color);
        
        let [points, shape, trans] = [this.points, this.shape, this.transform];
        
        if (shape == Shapes.LINE && points.length == 3) {
            cr.moveTo(points[0][0], points[0][1]);
            cr.curveTo(points[0][0], points[0][1], points[1][0], points[1][1], points[2][0], points[2][1]);
        } else if (shape == Shapes.NONE || shape == Shapes.LINE) {
            cr.moveTo(points[0][0], points[0][1]);
            for (let j = 1; j < points.length; j++) {
                cr.lineTo(points[j][0], points[j][1]);
            }
            
        } else if (shape == Shapes.ELLIPSE && points.length == 2) {
            this.rotate(cr, trans.angle + trans.startAngle, trans.center[0], trans.center[1]);
            this.scale(cr, trans.ratio, trans.center[0], trans.center[1]);
            let r = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
            cr.arc(points[0][0], points[0][1], r, 0, 2 * Math.PI);
            this.scale(cr, 1 / trans.ratio, trans.center[0], trans.center[1]);
            this.rotate(cr, - (trans.angle + trans.startAngle), trans.center[0], trans.center[1]);
            
        } else if (shape == Shapes.RECTANGLE && points.length == 2) {
            this.rotate(cr, trans.angle, trans.center[0], trans.center[1]);
            cr.rectangle(points[0][0], points[0][1], points[1][0] - points[0][0], points[1][1] - points[0][1]);
            this.rotate(cr, - trans.angle, trans.center[0], trans.center[1]);
            
        } else if (shape == Shapes.TEXT && points.length == 2) {
            this.rotate(cr, trans.angle, trans.center[0], trans.center[1]);
            if (this.state == TextState.DRAWING)
                cr.rectangle(points[0][0], points[0][1], points[1][0] - points[0][0], points[1][1] - points[0][1]);
            cr.selectFontFace(this.font.family, this.font.style, this.font.weight);
            cr.setFontSize(Math.abs(points[1][1] - points[0][1]));
            cr.moveTo(Math.min(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1]));
            cr.showText((showTextCursor) ? (this.text + "_") : this.text);
            this.rotate(cr, - trans.angle, trans.center[0], trans.center[1]);
        }
    },
    
    buildSVG: function(bgColor) {
        let row = "\n  ";
        let points = this.points.map((point) => [Math.round(point[0]*100)/100, Math.round(point[1]*100)/100]);
        let color = this.eraser ? bgColor : this.color;
        let isStraightLine = this.shape == Shapes.LINE && (points.length < 3 || points[2] == points[1] || points[2] == points[0]);
        let fill = this.fill && !isStraightLine;
        let attributes = `fill="${fill ? color : 'transparent'}" ` +
                         `stroke="${color}" ` +
                         `${fill ? '' : 'fill-opacity="0"'} ` +
                         `stroke-width="${this.line.lineWidth}" ` +
                         `stroke-linecap="${LineCapNames[this.line.lineCap].toLowerCase()}" ` +
                         `stroke-linejoin="${LineJoinNames[this.line.lineJoin].toLowerCase()}"`;
                          
        if (this.dash.array[0] > 0 && this.dash.array[1] > 0)
            attributes += ` stroke-dasharray="${this.dash.array[0]} ${this.dash.array[1]}" stroke-dashoffset="${this.dash.offset}"`;
        
        if (this.shape == Shapes.LINE && points.length == 3) {
            row += `<path ${attributes} d="M${points[0][0]} ${points[0][1]}`;
            row += ` C ${points[0][0]} ${points[0][1]}, ${points[1][0]} ${points[1][1]}, ${points[2][0]} ${points[2][1]}`;
            row += `${fill ? 'z' : ''}"/>`;
            
        } else if (this.shape == Shapes.NONE || this.shape == Shapes.LINE) {
            row += `<path ${attributes} d="M${points[0][0]} ${points[0][1]}`;
            for (let i = 1; i < points.length; i++) {
                row += ` L ${points[i][0]} ${points[i][1]}`;
            }
            row += `${fill ? 'z' : ''}"/>`;
            
        } else if (this.shape == Shapes.ELLIPSE && points.length == 2 && this.transform.ratio != 1) {
            let ry = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
            let rx = ry * this.transform.ratio;
            let angle = (this.transform.angle + this.transform.startAngle) * 180 / Math.PI;
            row += `<ellipse ${attributes} cx="${points[0][0]}" cy="${points[0][1]}" rx="${rx}" ry="${ry}" transform="rotate(${angle}, ${points[0][0]}, ${points[0][1]})"/>`;
            
        } else if (this.shape == Shapes.ELLIPSE && points.length == 2) {
            let r = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
            row += `<circle ${attributes} cx="${points[0][0]}" cy="${points[0][1]}" r="${r}"/>`;
            
        } else if (this.shape == Shapes.RECTANGLE && points.length == 2) {
            let transAttribute = "";
            if (this.transform.angle != 0) {
                let angle = this.transform.angle * 180 / Math.PI;
                transAttribute = ` transform="rotate(${angle}, ${this.transform.center[0]}, ${this.transform.center[1]})"`;
            }
            row += `<rect ${attributes} x="${Math.min(points[0][0], points[1][0])}" y="${Math.min(points[0][1], points[1][1])}" ` +
                   `width="${Math.abs(points[1][0] - points[0][0])}" height="${Math.abs(points[1][1] - points[0][1])}"${transAttribute}/>`;
                   
        } else if (this.shape == Shapes.TEXT && points.length == 2) {
            let transAttribute = "";
            if (this.transform.angle != 0) {
                let angle = this.transform.angle * 180 / Math.PI;
                transAttribute = ` transform="rotate(${angle}, ${this.transform.center[0]}, ${this.transform.center[1]})"`;
            }
            attributes = `fill="${color}" ` +
                         `stroke="transparent" ` +
                         `stroke-opacity="0" ` +
                         `font-family="${this.font.family}" ` +
                         `font-size="${Math.abs(points[1][1] - points[0][1])}" ` +
                         `font-weight="${FontWeightNames[this.font.weight].toLowerCase()}" ` +
                         `font-style="${FontStyleNames[this.font.style].toLowerCase()}"`;
            
            row += `<text ${attributes}${transAttribute} x="${Math.min(points[0][0], points[1][0])}" y="${Math.max(points[0][1], points[1][1])}">${this.text}</text>`;
        }
        
        return row;
    },
    
    addPoint: function(x, y, smoothedStroke) {
        this.points.push([x, y]);
        if (smoothedStroke)
            this.smooth(this.points.length - 1);
    },
    
    smooth: function(i) {
        if (i < 2)
            return;
        this.points[i-1] = [(this.points[i-2][0] + this.points[i][0]) / 2, (this.points[i-2][1] + this.points[i][1]) / 2];
    },
    
    smoothAll: function() {
        for (let i = 0; i < this.points.length; i++) {
            this.smooth(i);
        }
    },
    
    rotate: function(cr, angle, x, y) {
        if (angle == 0)
            return;
        cr.translate(x, y);
        cr.rotate(angle);
        cr.translate(-x, -y);
    },
    
    scale: function(cr, ratio, x, y) {
        if (ratio == 1)
            return;
        cr.translate(x, y);
        cr.scale(ratio, 1);
        cr.translate(-x, -y);
    },
    
    transformRectangle: function(x, y) {
        let points = this.points;
        if (points.length < 2 || points[0][0] == points[1][0] || points[0][1] == points[1][1])
            return;
            
        this.transform.center = [points[0][0] + (points[1][0] - points[0][0]) / 2, points[0][1] + (points[1][1] - points[0][1]) / 2];
        
        this.transform.angle = getAngle(this.transform.center[0], this.transform.center[1], points[1][0], points[1][1], x, y);
        this.transform.active = true;
    },
    
    transformEllipse: function(x, y) {
        let points = this.points;
        if (points.length < 2 || points[0][0] == points[1][0] || points[0][1] == points[1][1])
            return;
        
        this.transform.center = [points[0][0], points[0][1]];
        
        let r1 = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
        let r2 = Math.hypot(x - points[0][0], y - points[0][1]);
        this.transform.ratio = r2 / r1;
        
        this.transform.angle = getAngle(this.transform.center[0], this.transform.center[1], points[1][0], points[1][1], x, y);
        if (!this.transform.startAngle)
            // that is the angle between the direction when starting ellipticalizing, and the x-axis
            this.transform.startAngle = getAngle(points[0][0], points[0][1], points[0][0] + 1, points[0][1], points[1][0], points[1][1]);
        this.transform.active = true;
    },
    
    transformLine: function(x, y) {
        if (this.points.length < 2)
            return;
        if (this.points.length == 2)
            this.points[2] = this.points[1];
        this.points[1] = [x, y];
        this.transform.active = true;
    },
});

function getAngle(xO, yO, xA, yA, xB, yB) {
    // calculate angle of rotation in absolute value
    // cos(AOB) = (OA.OB)/(||OA||*||OB||) where OA.OB = (xA-xO)*(xB-xO) + (yA-yO)*(yB-yO)
    let angle = Math.acos( ((xA - xO)*(xB - xO) + (yA - yO)*(yB - yO)) / (Math.hypot(xA - xO, yA - yO) * Math.hypot(xB - xO, yB - yO)) );
    
    // determine the sign of the angle
    // equation of OA: y = ax + b
    let a = (yA - yO) / (xA - xO);
    let b = yA - a*xA;
    if (yB < a*xB + b)
        angle = - angle;
    if (xA < xO)
        angle = - angle;
    return angle;
}

var HELPER_ANIMATION_TIME = 0.25;
var MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
var MEDIA_KEYS_KEYS = {
    'screenshot': "Screenshot",
    'screenshot-clip': "Screenshot to clipboard",
    'area-screenshot': "Area screenshot",
    'area-screenshot-clip': "Area screenshot to clipboard"
};

// DrawingHelper provides the "help osd" (Ctrl + F1)
// It uses the same texts as in prefs
var DrawingHelper = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingHelper',
    Extends: St.ScrollView,
    
    _init: function(params, monitor) {
        this.parent(params);
        this.monitor = monitor;
        this.hide();
        this.vbox = new St.BoxLayout({ style_class: 'osd-window draw-on-your-screen-helper', vertical: true });
        this.add_actor(this.vbox);
        this.vbox.add(new St.Label({ text: _("Global") }));
        
        let settings = Convenience.getSettings();
        
        for (let settingKey in Prefs.GLOBAL_KEYBINDINGS) {
            let hbox = new St.BoxLayout({ vertical: false });
            if (settingKey.indexOf('-separator-') != -1) {
                this.vbox.add(hbox);
                continue;
            }
            if (!settings.get_strv(settingKey)[0])
                continue;
            let [keyval, mods] = Gtk.accelerator_parse(settings.get_strv(settingKey)[0]);
            hbox.add(new St.Label({ text: _(Prefs.GLOBAL_KEYBINDINGS[settingKey]) }));
            hbox.add(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods) }), { expand: true });
            this.vbox.add(hbox);
        }
        
        this.vbox.add(new St.Label({ text: _("Internal") }));
        
        for (let i = 0; i < Prefs.OTHER_SHORTCUTS.length; i++) {
            if (Prefs.OTHER_SHORTCUTS[i].desc.indexOf('-separator-') != -1) {
                this.vbox.add(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
                continue;
            }
            let hbox = new St.BoxLayout({ vertical: false });
            hbox.add(new St.Label({ text: _(Prefs.OTHER_SHORTCUTS[i].desc) }));
            hbox.add(new St.Label({ text: _(Prefs.OTHER_SHORTCUTS[i].shortcut) }), { expand: true });
            this.vbox.add(hbox);
        }
        
        this.vbox.add(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
        
        for (let settingKey in Prefs.INTERNAL_KEYBINDINGS) {
            if (settingKey.indexOf('-separator-') != -1) {
                this.vbox.add(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
                continue;
            }
            let hbox = new St.BoxLayout({ vertical: false });
            if (!settings.get_strv(settingKey)[0])
                continue;
            let [keyval, mods] = Gtk.accelerator_parse(settings.get_strv(settingKey)[0]);
            hbox.add(new St.Label({ text: _(Prefs.INTERNAL_KEYBINDINGS[settingKey]) }));
            hbox.add(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods) }), { expand: true });
            this.vbox.add(hbox);
        }
        
        let mediaKeysSettings;
        try { mediaKeysSettings = Convenience.getSettings(MEDIA_KEYS_SCHEMA); } catch(e) { return; }
        this.vbox.add(new St.Label({ text: _("System") }));
        
        for (let settingKey in MEDIA_KEYS_KEYS) {
            if (!mediaKeysSettings.settings_schema.has_key(settingKey))
                continue;
            let shortcut = GS_VERSION < '3.33.0' ? mediaKeysSettings.get_string(settingKey) : mediaKeysSettings.get_strv(settingKey)[0];
            let [keyval, mods] = Gtk.accelerator_parse(shortcut);
            let hbox = new St.BoxLayout({ vertical: false });
            hbox.add(new St.Label({ text: _(MEDIA_KEYS_KEYS[settingKey]) }));
            hbox.add(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods) }), { expand: true });
            this.vbox.add(hbox);
        }
    },
    
    showHelp: function() {
        this.opacity = 0;
        this.show();
        
        let maxHeight = this.monitor.height*(3/4);
        this.set_height(Math.min(this.height, maxHeight));
        this.set_position(Math.floor(this.monitor.width / 2 - this.width / 2),
                          Math.floor(this.monitor.height / 2 - this.height / 2));
                          
        if (this.height == maxHeight)
            this.vscrollbar_policy = Gtk.PolicyType.ALWAYS;
        else
            this.vscrollbar_policy = Gtk.PolicyType.NEVER;
        
        Tweener.removeTweens(this);
        Tweener.addTween(this, { opacity: 255,
                                 time: HELPER_ANIMATION_TIME,
                                 transition: 'easeOutQuad',
                                 onComplete: null });
    },
    
    hideHelp: function() {
        Tweener.removeTweens(this);
        Tweener.addTween(this, { opacity: 0,
                                 time: HELPER_ANIMATION_TIME,
                                 transition: 'easeOutQuad',
                                 onComplete: this.hide.bind(this) });
        
    },
});

function getActor(object) {
    return GS_VERSION < '3.33.0' ? object.actor : object;
}

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
            if (this.saveDrawingSubMenu.isOpen)
                this.saveDrawingSubMenu.close();
            menuCloseFunc.bind(this.menu)(animate);
        };
        
        this.strokeIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(STROKE_ICON_PATH) });
        this.fillIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(FILL_ICON_PATH) });
        this.linejoinIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(LINEJOIN_ICON_PATH) });
        this.linecapIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(LINECAP_ICON_PATH) });
        this.fullLineIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(FULL_LINE_ICON_PATH) });
        this.dashedLineIcon = new Gio.FileIcon({ file: Gio.File.new_for_path(DASHED_LINE_ICON_PATH) });
    },
    
    disable: function() {
        this.menuManager.removeMenu(this.menu);
        Main.layoutManager.uiGroup.remove_actor(this.menu.actor);
        this.menu.actor.destroy();
    },
    
    _onMenuOpenStateChanged: function(menu, open) {
        if (open) {
            this.area.setPointerCursor('DEFAULT');
        } else {
            this.area.updatePointerCursor();
            // actionMode has changed, set previous actionMode in order to keep internal shortcuts working
            Main.actionMode = Extension.DRAWING_ACTION_MODE | Shell.ActionMode.NORMAL;
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
        
        this.menu.addAction(_("Undo"), this.area.undo.bind(this.area), 'edit-undo-symbolic');
        this.menu.addAction(_("Redo"), this.area.redo.bind(this.area), 'edit-redo-symbolic');
        this.menu.addAction(_("Erase"), this.area.deleteLastElement.bind(this.area), 'edit-clear-all-symbolic');
        this.menu.addAction(_("Smooth"), this.area.smoothLastElement.bind(this.area), 'format-text-strikethrough-symbolic');
        this._addSeparator(this.menu);
        
        this._addSubMenuItem(this.menu, null, ShapeNames, this.area, 'currentShape', this.updateSectionVisibility.bind(this));
        this._addColorSubMenuItem(this.menu);
        this.fillItem = this._addSwitchItem(this.menu, _("Fill"), this.strokeIcon, this.fillIcon, this.area, 'fill');
        this._addSeparator(this.menu);
        
        let lineSection = new PopupMenu.PopupMenuSection();
        this._addSliderItem(lineSection, this.area, 'currentLineWidth');
        this._addSubMenuItem(lineSection, this.linejoinIcon, LineJoinNames, this.area, 'currentLineJoin');
        this._addSubMenuItem(lineSection, this.linecapIcon, LineCapNames, this.area, 'currentLineCap');
        this._addSwitchItem(lineSection, _("Dashed"), this.fullLineIcon, this.dashedLineIcon, this.area, 'dashedLine');
        this._addSeparator(lineSection);
        this.menu.addMenuItem(lineSection);
        lineSection.itemActivated = () => {};
        this.lineSection = lineSection;
        
        let fontSection = new PopupMenu.PopupMenuSection();
        let FontFamilyNamesCopy = Object.create(FontFamilyNames);
        FontFamilyNamesCopy[0] = this.area.fontFamily;
        this._addSubMenuItem(fontSection, 'font-x-generic-symbolic', FontFamilyNamesCopy, this.area, 'currentFontFamilyId');
        this._addSubMenuItem(fontSection, 'format-text-bold-symbolic', FontWeightNames, this.area, 'currentFontWeight');
        this._addSubMenuItem(fontSection, 'format-text-italic-symbolic', FontStyleNames, this.area, 'currentFontStyle');
        this._addSeparator(fontSection);
        this.menu.addMenuItem(fontSection);
        this.fontSection = fontSection;
        
        let manager = Extension.manager;
        this._addSwitchItemWithCallback(this.menu, _("Hide panel and dock"), manager.hiddenList ? true : false, manager.togglePanelAndDockOpacity.bind(manager));
        this._addSwitchItemWithCallback(this.menu, _("Add a drawing background"), this.area.hasBackground, this.area.toggleBackground.bind(this.area));
        this._addSwitchItemWithCallback(this.menu, _("Square drawing area"), this.area.isSquareArea, this.area.toggleSquareArea.bind(this.area));
        this._addSeparator(this.menu);
        
        this._addDrawingNameItem(this.menu);
        this._addOpenDrawingSubMenuItem(this.menu);
        this._addSaveDrawingSubMenuItem(this.menu);
        
        this.menu.addAction(_("Save drawing as a SVG file"), this.area.saveAsSvg.bind(this.area), 'image-x-generic-symbolic');
        this.menu.addAction(_("Open user.css"), manager.openUserStyleFile.bind(manager), 'document-page-setup-symbolic');
        this.menu.addAction(_("Show help"), this.area.toggleHelp.bind(this.area), 'preferences-desktop-keyboard-shortcuts-symbolic');
        
        this.updateSectionVisibility();
    },
    
    updateSectionVisibility: function() {
        if (this.area.currentShape != Shapes.TEXT) {
            this.lineSection.actor.show();
            this.fontSection.actor.hide();
            this.fillItem.setSensitive(true);
        } else {
            this.lineSection.actor.hide();
            this.fontSection.actor.show();
            this.fillItem.setSensitive(false);
        }
    },
    
    _addSwitchItem: function(menu, label, iconFalse, iconTrue, target, targetProperty) {
        let item = new PopupMenu.PopupSwitchMenuItem(label, target[targetProperty]);
        
        item.icon = new St.Icon({ style_class: 'popup-menu-icon' });
        getActor(item).insert_child_at_index(item.icon, 1);
        item.icon.set_gicon(target[targetProperty] ? iconTrue : iconFalse);
        
        item.connect('toggled', (item, state) => {
            target[targetProperty] = state;
            item.icon.set_gicon(target[targetProperty] ? iconTrue : iconFalse);
        });
        menu.addMenuItem(item);
        return item;
    },
    
    _addSwitchItemWithCallback: function(menu, label, active, onToggled) {
        let item = new PopupMenu.PopupSwitchMenuItem(label, active);
        item.connect('toggled', onToggled);
        menu.addMenuItem(item);
    },
    
    _addSliderItem: function(menu, target, targetProperty) {
        let item = new PopupMenu.PopupBaseMenuItem({ activate: false });
        let label = new St.Label({ text: target[targetProperty] + " " + _("px"), style_class: 'draw-on-your-screen-menu-slider-label' });
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
        
        getActor(item).add(getActor(slider), { expand: true });
        getActor(item).add(label);
        getActor(item).connect('key-press-event', slider.onKeyPressEvent.bind(slider));
        menu.addMenuItem(item);
    },
    
    _addSubMenuItem: function(menu, icon, obj, target, targetProperty, callback) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_(obj[target[targetProperty]]), icon ? true : false);
        if (icon && icon instanceof GObject.Object && GObject.type_is_a(icon, Gio.Icon))
            item.icon.set_gicon(icon);
        else if (icon)
            item.icon.set_icon_name(icon);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        Mainloop.timeout_add(0, () => {
            for (let i in obj) {
                let text;
                if (targetProperty == 'currentFontFamilyId')
                    text = `<span font_family="${obj[i]}">${_(obj[i])}</span>`;
                else if (targetProperty == 'currentFontWeight')
                    text = `<span font_weight="${obj[i].toLowerCase()}">${_(obj[i])}</span>`;
                else if (targetProperty == 'currentFontStyle')
                    text = `<span font_style="${obj[i].toLowerCase()}">${_(obj[i])}</span>`;
                else
                    text = _(obj[i]);
                
                let iCaptured = i;
                let subItem = item.menu.addAction(text, () => {
                    item.label.set_text(_(obj[iCaptured]));
                    target[targetProperty] = iCaptured;
                    if (callback)
                        callback();
                });
                
                subItem.label.get_clutter_text().set_use_markup(true);
            }
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
    },
    
    _addColorSubMenuItem: function(menu) {
        let item = new PopupMenu.PopupSubMenuMenuItem(_("Color"), true);
        item.icon.set_icon_name('document-edit-symbolic');
        item.icon.set_style(`color:${this.area.currentColor.to_string().slice(0, 7)};`);
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        Mainloop.timeout_add(0, () => {
            for (let i = 1; i < this.area.colors.length; i++) {
                let text = `<span foreground="${this.area.colors[i].to_string()}">${this.area.colors[i].to_string()}</span>`;
                let iCaptured = i;
                let colorItem = item.menu.addAction(text, () => {
                    this.area.currentColor = this.area.colors[iCaptured];
                    item.icon.set_style(`color:${this.area.currentColor.to_string().slice(0, 7)};`);
                });
                colorItem.label.get_clutter_text().set_use_markup(true);
            }
            return GLib.SOURCE_REMOVE;
        });
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
        item.icon.set_icon_name('document-open-symbolic');
        
        item.menu.itemActivated = () => {
            item.menu.close();
        };
        
        Mainloop.timeout_add(0, () => {
            this._populateOpenDrawingSubMenu();
            // small trick to prevent the menu from "jumping" on first opening
            item.menu.open();
            item.menu.close();
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
    },
    
    _populateOpenDrawingSubMenu: function() {
        this.openDrawingSubMenu.removeAll();
        let jsonFiles = getJsonFiles();
        jsonFiles.forEach(file => {
            let item = this.openDrawingSubMenu.addAction(`<span font_family="Monospace"><i>${file.displayName}</i></span>`, () => {
                this.area.loadJson(file.name);
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
                file.delete();
                this._populateOpenDrawingSubMenu();
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
        
        Mainloop.timeout_add(0, () => {
            this._populateSaveDrawingSubMenu();
            // small trick to prevent the menu from "jumping" on first opening
            item.menu.open();
            item.menu.close();
            return GLib.SOURCE_REMOVE;
        });
        menu.addMenuItem(item);
    },
    
    _updateSaveDrawingSubMenuItemSensitivity: function() {
        this.saveDrawingSubMenuItem.setSensitive(this.area.elements.length > 0);
    },
    
    _populateSaveDrawingSubMenu: function() {
        this.saveEntry = new DrawingMenuEntry({ initialTextGetter: getDateString,
                                                entryActivateCallback: (text) => {
                                                    this.area.saveAsJsonWithName(text);
                                                    this.saveDrawingSubMenu.toggle();
                                                    this._updateDrawingNameMenuItem();
                                                    this._populateOpenDrawingSubMenu();
                                                },
                                                invalidStrings: [Me.metadata['persistent-file-name'], '/'],
                                                primaryIconName: 'insert-text' });
        this.saveDrawingSubMenu.addMenuItem(this.saveEntry.item);
    },
    
    _addSeparator: function(menu) {
        let separatorItem = new PopupMenu.PopupSeparatorMenuItem(' ');
        getActor(separatorItem).add_style_class_name('draw-on-your-screen-menu-separator-item');
        menu.addMenuItem(separatorItem);
    }
});

// based on searchItem.js, https://github.com/leonardo-bartoli/gnome-shell-extension-Recents
var DrawingMenuEntry = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingMenuEntry',
    
    _init: function (params) {
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
            can_focus: true
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
        
        getActor(this.item).add(this.entry, { expand: true });
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


