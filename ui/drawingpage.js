/*
 * Copyright 2022 zhrexl
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as GimpPaletteParser from '../gimpPaletteParser.js';
import { CURATED_UUID as UUID } from '../utils.js';


const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_start: MARGIN, margin_end: MARGIN, spacing: 4 };

const DrawingPage = GObject.registerClass({
    GTypeName: `${UUID}-Drawing`
}, class DrawingPage extends Adw.PreferencesPage {
    constructor(extensionPreferences, window) {
        super({});
        
        this.window = window;
        this.set_title("Drawing Page");
        this.set_name('drawing');
        this.set_icon_name("applications-graphics-symbolic");

        this.settings = extensionPreferences.getSettings(extensionPreferences.metadata['settings-schema'] + '.drawing');
          
        this.schema = this.settings.settings_schema;
      
        this.palettes = this.settings.get_value('palettes').deep_unpack();
        
        this.palettes_adw_group = Adw.PreferencesGroup.new()
        this.palettes_adw_group.set_title(_("Palettes"));

        this.PalettesActionRow = Adw.ActionRow.new();

        this.PalettesActionRow.set_title(_("New Pallete"));
        this.PalettesActionRow.set_subtitle(_("Create or Import pallete"));
        let addButton = Gtk.Button.new_from_icon_name('list-add-symbolic');
        addButton.set_tooltip_text(_("Add a new palette"));
        addButton.valign = Gtk.Align.CENTER;
        addButton.connect('clicked', this._addNewPalette.bind(this));

        let importButton = Gtk.Button.new_from_icon_name('document-open-symbolic');
        importButton.set_tooltip_text(_("Select a File"));
        importButton.valign = Gtk.Align.CENTER;
        importButton.connect('clicked', this._importPalette.bind(this));

        this.PalettesActionRow.add_suffix(addButton);
        this.PalettesActionRow.add_suffix(importButton);
        this.palettes_adw_group.add(this.PalettesActionRow);
                
        this.nPalettes = [];
        this.settings.connect('changed::palettes', this._updatePalettes.bind(this));
        this._updatePalettes();
  
        /* Area Group */
        let adw_groupArea = Adw.PreferencesGroup.new()
        adw_groupArea.set_title(_("Area"));

        let squareAreaRow = Adw.ActionRow.new();
        squareAreaRow.set_title(this.schema.get_key('square-area-size').get_summary());
        let squareAreaAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                         name: this.schema.get_key('square-area-auto').get_summary(),
                                                         tooltip_text: this.schema.get_key('square-area-auto').get_description() });
        let squareAreaSizeButton = new PixelSpinButton({ width_chars: 5, digits: 0, step: 1,
                                                         range: this.schema.get_key('square-area-size').get_range(),
                                                         name: this.schema.get_key('square-area-size').get_summary(),
                                                         tooltip_text: this.schema.get_key('square-area-size').get_description() });
        this.settings.bind('square-area-auto', squareAreaAutoButton, 'active', 0);
        this.settings.bind('square-area-size', squareAreaSizeButton, 'value', 0);
        squareAreaAutoButton.bind_property('active', squareAreaSizeButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);

        squareAreaAutoButton.valign = Gtk.Align.CENTER;
        squareAreaSizeButton.valign = Gtk.Align.CENTER;

        squareAreaRow.add_suffix(squareAreaAutoButton);
        squareAreaRow.add_suffix(squareAreaSizeButton);


        let backgroundColorRow = Adw.ActionRow.new();
        backgroundColorRow.set_title(this.schema.get_key('background-color').get_summary());

        let backgroundColorButton = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                            name: this.schema.get_key('background-color').get_summary(),
                                                            tooltip_text: this.schema.get_key('background-color').get_description() });
        this.settings.bind('background-color', backgroundColorButton, 'color-string', 0);

        backgroundColorButton.valign = Gtk.Align.CENTER;
        backgroundColorRow.add_suffix(backgroundColorButton);

        let gridLineRow = Adw.ActionRow.new();
        gridLineRow.set_title( _("Grid overlay line"));

        let gridLineAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                       name: this.schema.get_key('grid-line-auto').get_summary(),
                                                       tooltip_text: this.schema.get_key('grid-line-auto').get_description() });
        let gridLineWidthButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                        range: this.schema.get_key('grid-line-width').get_range(),
                                                        name: this.schema.get_key('grid-line-width').get_summary(),
                                                        tooltip_text: this.schema.get_key('grid-line-width').get_description() });
        let gridLineSpacingButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 1,
                                                          range: this.schema.get_key('grid-line-spacing').get_range(),
                                                          name: this.schema.get_key('grid-line-spacing').get_summary(),
                                                          tooltip_text: this.schema.get_key('grid-line-spacing').get_description() });

        this.settings.bind('grid-line-auto', gridLineAutoButton, 'active', 0);
        this.settings.bind('grid-line-width', gridLineWidthButton, 'value', 0);
        this.settings.bind('grid-line-spacing', gridLineSpacingButton, 'value', 0);

        gridLineAutoButton.bind_property('active', gridLineWidthButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        gridLineAutoButton.bind_property('active', gridLineSpacingButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);

        gridLineAutoButton.valign = Gtk.Align.CENTER;
        gridLineWidthButton.valign = Gtk.Align.CENTER;
        gridLineSpacingButton.valign = Gtk.Align.CENTER;

        gridLineRow.add_suffix(gridLineAutoButton);
        gridLineRow.add_suffix(gridLineWidthButton);
        gridLineRow.add_suffix(gridLineSpacingButton);

        let gridColorRow = Adw.ActionRow.new();
        gridColorRow.set_title(this.schema.get_key('grid-color').get_summary());

        let gridColorButton = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                      name: this.schema.get_key('grid-color').get_summary(),
                                                      tooltip_text: this.schema.get_key('grid-color').get_description() });
        this.settings.bind('grid-color', gridColorButton, 'color-string', 0);
        gridColorRow.add_suffix(gridColorButton);
        gridColorButton.valign = Gtk.Align.CENTER;

        adw_groupArea.add(squareAreaRow);
        adw_groupArea.add(backgroundColorRow);
        adw_groupArea.add(gridLineRow);
        adw_groupArea.add(gridColorRow);

        /* End of Area Group */

        /* Tools Group */
        let adw_groupTools = Adw.PreferencesGroup.new()
        adw_groupTools.set_title(_("Tools"));


        let dashArrayRow = Adw.ActionRow.new();
        dashArrayRow.set_title(_("Dash array"));

        let dashArrayAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                        name: this.schema.get_key('dash-array-auto').get_summary(),
                                                        tooltip_text: this.schema.get_key('dash-array-auto').get_description() });
        let dashArrayOnButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                      range: this.schema.get_key('dash-array-on').get_range(),
                                                      name: this.schema.get_key('dash-array-on').get_summary(),
                                                      tooltip_text: this.schema.get_key('dash-array-on').get_description() });
        let dashArrayOffButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                       range: this.schema.get_key('dash-array-off').get_range(),
                                                       name: this.schema.get_key('dash-array-off').get_summary(),
                                                       tooltip_text: this.schema.get_key('dash-array-off').get_description() });
        this.settings.bind('dash-array-auto', dashArrayAutoButton, 'active', 0);
        this.settings.bind('dash-array-on', dashArrayOnButton, 'value', 0);
        this.settings.bind('dash-array-off', dashArrayOffButton, 'value', 0);
        dashArrayAutoButton.bind_property('active', dashArrayOnButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        dashArrayAutoButton.bind_property('active', dashArrayOffButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        dashArrayAutoButton.valign = Gtk.Align.CENTER;
        dashArrayOnButton.valign = Gtk.Align.CENTER;
        dashArrayOffButton.valign = Gtk.Align.CENTER;
        dashArrayRow.add_suffix(dashArrayAutoButton);
        dashArrayRow.add_suffix(dashArrayOnButton);
        dashArrayRow.add_suffix(dashArrayOffButton);


        let dashOffsetRow = Adw.ActionRow.new();
        dashOffsetRow.set_title(this.schema.get_key('dash-offset').get_summary());

        let dashOffsetButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                     range: this.schema.get_key('dash-offset').get_range(),
                                                     name: this.schema.get_key('dash-offset').get_summary(),
                                                     tooltip_text: this.schema.get_key('dash-offset').get_description() });
        this.settings.bind('dash-offset', dashOffsetButton, 'value', 0);
        dashOffsetButton.valign = Gtk.Align.CENTER;
        dashOffsetRow.add_suffix(dashOffsetButton);

        let imageLocationRow = Adw.ActionRow.new();
        imageLocationRow.set_title(this.schema.get_key('image-location').get_summary());

        let imageLocationButton = new FileChooserButton({ action: Gtk.FileChooserAction.SELECT_FOLDER,
                                                          name: this.schema.get_key('image-location').get_summary(),
                                                          tooltip_text: this.schema.get_key('image-location').get_description() });
        this.settings.bind('image-location', imageLocationButton, 'location', 0);
        imageLocationButton.valign = Gtk.Align.CENTER;
        imageLocationRow.add_suffix(imageLocationButton);


        adw_groupTools.add(dashArrayRow);
        adw_groupTools.add(dashOffsetRow);
        adw_groupTools.add(imageLocationRow);

        let resetButton = new Gtk.Button({ label: _("Reset settings"), halign: Gtk.Align.CENTER });
        resetButton.get_style_context().add_class('destructive-action');
        resetButton.connect('clicked', () => this.schema.list_keys().forEach(key => this.settings.reset(key)));

        resetButton.set_margin_top(12);
        adw_groupTools.add(resetButton);
        /* End of Tools Group */

        this.add(this.palettes_adw_group);
        this.add(adw_groupArea);
        this.add(adw_groupTools);
    };
     _updatePalettes() {
        this.palettes = this.settings.get_value('palettes').deep_unpack();
        /*TODO: I Should probably reutilize these widgets instead of just removing it */
        this.nPalettes.forEach((actionrow) => {
          if (actionrow){
            this.palettes_adw_group.remove(actionrow);
            actionrow.run_dispose();
          }
        });
        this.nPalettes = [];
        
        this.palettes.forEach((palette,index) => {
          let tmpAction = Adw.ActionRow.new();
          tmpAction.set_title(palette[0]);
          this.nPalettes.push(tmpAction);
          
          let EditButton   = Gtk.Button.new_from_icon_name('edit-symbolic');
          EditButton.set_tooltip_text(_("Edit this palette colors"));
          EditButton.valign = Gtk.Align.CENTER;
          EditButton.connect('clicked', () => {this._editPalette(palette, index)});
          
          let RemoveButton = Gtk.Button.new_from_icon_name('edit-delete-symbolic');
          RemoveButton.set_tooltip_text(_("Remove this palette"));
          RemoveButton.valign = Gtk.Align.CENTER;
          RemoveButton.connect('clicked', () => {
            this.palettes.splice(index,1);
            this._savePalettes();
          });
          
          tmpAction.add_suffix(EditButton);
          tmpAction.add_suffix(RemoveButton);
          
          this.palettes_adw_group.add(this.nPalettes[index]);
        });
        
    }

    _savePalettes() {
        this.settings.set_value('palettes', new GLib.Variant('a(sas)', this.palettes));
    }

    _onPaletteNameChanged(index, text) {
        this.palettes[index][0] = text;
        this._savePalettes();
    }

    _onPaletteColorChanged(paletteIndex, colorIndex, colorButton) {
        this.palettes[paletteIndex][1][colorIndex] = colorButton.get_rgba().to_string();
        if (colorButton.tooltip_text)
            this.palettes[paletteIndex][1][colorIndex] += `:${colorButton.tooltip_text}`;
        this._savePalettes();
    }

    _addNewPalette() {
        let colors = Array(9).fill('Black');
        // Translators: default name of a new palette
        this.palettes.push([_("New palette"), colors]);
        this._savePalettes();
    }

    _importPalette() {
        let dialog = new Gtk.FileChooserDialog({
            title: _("Select a File"),
            action: Gtk.FileChooserAction.OPEN,
            modal: true,
        });
        dialog.add_button(_("_Cancel"), Gtk.ResponseType.CANCEL);
        dialog.add_button(_("_Open"), Gtk.ResponseType.ACCEPT);

        let filter = new Gtk.FileFilter();
        filter.set_name("GIMP Palette (*.gpl)");
        filter.add_pattern('*.gpl');
        dialog.add_filter(filter);

        dialog.connect('response', (dialog, response) => {
            if (response == Gtk.ResponseType.ACCEPT) {
                let file = dialog.get_file();
                let palettes = GimpPaletteParser.parseFile(file);
                palettes.forEach(palette => this.palettes.push(palette));
                this._savePalettes();
            }
            dialog.destroy();
        });

        dialog.show();
    }
    _editPalette(palette, index)
    {
      let modal = new Gtk.Dialog({ 
        default_height: 400,
        default_width: 500,
        modal: true,
        transient_for: this.window,
        title: 'Editing ' + palette[0] + ' palette',
        use_header_bar: true
        });
    
      let contentArea = modal.get_content_area();
      let preferencesPage = Adw.PreferencesPage.new();
      let editor_palettes_group = Adw.PreferencesGroup.new()
      editor_palettes_group.set_title(_("Customize Palette"));

      let PalettesNameActionRow = Adw.ActionRow.new();
      PalettesNameActionRow.set_title(_("Name"));
      let EntryName = Gtk.EditableLabel.new(palette[0]);
      
      EntryName.connect('changed', () => {
        this._onPaletteNameChanged(index, EntryName.get_text());
      });
      
      EntryName.set_alignment(1);
      PalettesNameActionRow.add_suffix(EntryName);
      editor_palettes_group.add(PalettesNameActionRow);
      
      palette[1].forEach((color, colorindex)=>{
        let pActionRow = Adw.ActionRow.new();
        let [cname, title] = color.split(":");
        
        let colortitle = Gtk.EditableLabel.new(title || cname);
        colortitle.connect('changed', () => {
          this.palettes[index][1][colorindex] = cname+':'+colortitle.get_text();
          this._savePalettes();
        });
        
        pActionRow.add_prefix(colortitle);
        let colorEntry = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                name: cname,
                                                tooltip_text: title || cname});
        colorEntry.color_string = cname; 
        colorEntry.valign = Gtk.Align.CENTER;
        colorEntry.connect('notify::color-string', () => {
          this._onPaletteColorChanged(index,colorindex, colorEntry);
        });

        
        pActionRow.add_suffix(colorEntry);
        editor_palettes_group.add(pActionRow);
      });
    
      preferencesPage.add(editor_palettes_group);
      contentArea.append(preferencesPage);
      modal.show();
    }
    _removePalette(paletteIndex) {
        this.palettes.splice(paletteIndex, 1);
        this._savePalettes();
    }
  });


const PixelSpinButton = new GObject.Class({
    Name: `${UUID}-PixelSpinButton2`,
    Extends: Gtk.SpinButton,
    Properties: {
        'range': GObject.param_spec_variant('range', 'range', 'GSettings range',
                                            GLib.VariantType.new('(sv)'), null, GObject.ParamFlags.WRITABLE),

        'step': GObject.ParamSpec.double('step', 'step', 'step increment',
                                         GObject.ParamFlags.WRITABLE,
                                         0, 1000, 1)
    },

    set range(range) {
        let [type, variant] = range.deep_unpack();
        if (type == 'range') {
            let [min, max] = variant.deep_unpack();
            this.adjustment.set_lower(min);
            this.adjustment.set_upper(max);
        }
    },

    set step(step) {
        this.adjustment.set_step_increment(step);
        this.adjustment.set_page_increment(step * 10);
    },

    on_output: function() {
        this.text = _("%f px").format(Number(this.value).toFixed(2));
        return true;
    },

    // Prevent accidental scrolling (GTK 3).
    on_scroll_event: function(event) {
        if (this.has_focus) {
            try {
                GObject.signal_chain_from_overridden([this, event], false);
            } catch(e) { }

            return Gdk.EVENT_STOP;
        }

        return Gdk.EVENT_PROPAGATE;
    }
});


// A color button that can be easily bound with a color string setting.
const ColorStringButton = new GObject.Class({
    Name: `${UUID}-ColorStringButton2`,
    Extends: Gtk.ColorButton,
    Properties: {
        'color-string': GObject.ParamSpec.string('color-string', 'colorString', 'A string that describes the color',
                                                 GObject.ParamFlags.READWRITE, 'black')
    },

    get color_string() {
        return this._color_string || 'black';
    },

    set color_string(colorString) {
        this._color_string = colorString;

        let newRgba = new Gdk.RGBA();
        newRgba.parse(colorString);
        this.set_rgba(newRgba);
    },

    on_color_set: function() {
        let oldRgba = new Gdk.RGBA();
        oldRgba.parse(this.color_string);

        // Do nothing if the new color is equivalent to the old color (e.g. "black" and "rgb(0,0,0)").
        if (!this.rgba.equal(oldRgba)) {
            this._color_string = this.rgba.to_string();
            this.notify('color-string');
        }
    }
});


const FileChooserButton = new GObject.Class({
    Name: `${UUID}-FileChooserButton2`,
    Extends: Gtk.Button,
    Properties: {
        'action': GObject.ParamSpec.enum('action', 'action', 'action',
                                         GObject.ParamFlags.READWRITE,
                                         Gtk.FileChooserAction.$gtype,
                                         Gtk.FileChooserAction.SELECT_FOLDER),

        'location': GObject.ParamSpec.string('location', 'location', 'location',
                                             GObject.ParamFlags.READWRITE, '')
    },

    get location() {
        return this._location || "";
    },

    set location(location) {
        if (!this._location || this._location != location) {
            this._location = location;
            this.label = location ?
                         Gio.File.new_for_commandline_arg(location).query_info('standard::display-name', Gio.FileQueryInfoFlags.NONE, null).get_display_name() :
                         _("(None)");

            this.notify('location');
        }
    },

    vfunc_clicked: function() {
        let dialog = new Gtk.FileChooserDialog({
            title: _(this.name),
            action: this.action,
            modal: true,
        });
        dialog.add_button(_("_Cancel"), Gtk.ResponseType.CANCEL);
        dialog.add_button(_("_Select"), Gtk.ResponseType.ACCEPT);

        if (this.location)
            dialog.set_file(Gio.File.new_for_commandline_arg(this.location));

        dialog.connect('response', (dialog, response) => {
            if (response == Gtk.ResponseType.ACCEPT)
                    this.location = dialog.get_file().get_path();
            dialog.destroy();
        });

        dialog.show();
    }
});

export default DrawingPage;