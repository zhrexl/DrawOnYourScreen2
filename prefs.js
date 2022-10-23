/*
 * Copyright 2019 Abakkk
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
 * SPDX-FileCopyrightText: 2019 Abakkk
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* jslint esversion: 6 */
/* exported init, buildPrefsWidget */

const { Adw, Gdk, GLib, Gtk, GObject, Gio } = imports.gi;

const IS_GTK3 = Gtk.get_major_version() == 3;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.ui.preferencespage;
const Drawpage = Me.imports.ui.drawingpage;
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const GimpPaletteParser = Me.imports.gimpPaletteParser;
const Shortcuts = Me.imports.shortcuts;
const gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const _ = function(string) {
    if (!string)
        return "";
    return gettext(string);
};
const _GTK = imports.gettext.domain(IS_GTK3 ? 'gtk30' : 'gtk40').gettext;

const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_start: MARGIN, margin_end: MARGIN, spacing: 4 };
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');

if (IS_GTK3) {
    Gtk.Container.prototype.append = Gtk.Container.prototype.add;
    Gtk.Bin.prototype.set_child = Gtk.Container.prototype.add;
}

const setAccessibleLabel = function(widget, label) {
    if (IS_GTK3)
        widget.get_accessible().set_name(label);
    else
        widget.update_property([Gtk.AccessibleProperty.LABEL], [label]);
};

const setAccessibleDescription = function(widget, description) {
    if (IS_GTK3)
        widget.get_accessible().set_description(description);
    else
        widget.update_property([Gtk.AccessibleProperty.DESCRIPTION], [description]);
};

const getChildrenOf = function(widget) {
    if (IS_GTK3)
        return widget.get_children();
    else
        return [...widget];
};

function init() {
    Convenience.initTranslations();
}


function fillPreferencesWindow(window) {

    let page1 = new Prefs.Preferences();
    page1.set_title(_("Preferences"));
    page1.set_name('prefs');


    let page2 = new Drawpage.DrawingPage();
    page2.set_title( _("Drawing"));
    page2.set_name('drawing');


    let page3 = Adw.PreferencesPage.new();
    page3.set_title( _("About"));
    page3.set_name('about');
    page3.set_icon_name("dialog-question-symbolic");

    let aboutpage = new AboutPage();
    aboutpage.set_vexpand(true);
    let about_group = Adw.PreferencesGroup.new();
    about_group.add(aboutpage);

    page3.add(about_group);

    window.add(page1);
    window.add(page2);
    window.add(page3);
}

const AboutPage = new GObject.Class({
    Name: `${UUID}-AboutPage`,
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 3 * MARGIN, margin_bottom: 3 * MARGIN, margin_start: 3 * MARGIN, margin_end: 3 * MARGIN });
        this.set_child(vbox);
        
        // Translators: you are free to translate the extension name, that is displayed in About page, or not
        let name = "<b> " + _("Draw On You Screen 2") + "</b>";
        // Translators: version number in "About" page
        let version = _("Version %f").format(Me.metadata.version);
        // Translators: you are free to translate the extension description, that is displayed in About page, or not
        let description = _("Start drawing with Super+Alt+D and save your beautiful work by taking a screenshot");
        let link = "<span><a href=\"" + Me.metadata.url + "\">" + Me.metadata.url + "</a></span>";
        let licenseName = _GTK("GNU General Public License, version 3 or later");
        let licenseLink = "https://www.gnu.org/licenses/gpl-3.0.html";
        let license = "<small>" + _GTK("This program comes with absolutely no warranty.\nSee the <a href=\"%s\">%s</a> for details.").format(licenseLink, licenseName) + "</small>";
        
        let aboutLabel = new Gtk.Label({ wrap: true, justify: Gtk.Justification.CENTER, use_markup: true, label:
            name + "\n\n" + version + "\n\n" + description + "\n\n" + link + "\n\n" + license + "\n" });
        
        vbox.append(aboutLabel);
        
        let creditBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 2 * MARGIN, margin_bottom: 2 * MARGIN, margin_start: 2 * MARGIN, margin_end: 2 * MARGIN, spacing: 5 });
        let leftBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        let rightBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: Gtk.Justification.RIGHT,
                                       use_markup: true, label: "<small>" + _GTK("Created by") + "</small>" }));
        rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: Gtk.Justification.LEFT,
                                        use_markup: true, label: "<small><a href=\"https://codeberg.org/abak\">Abakkk</a></small>" }));
                                        
        leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: Gtk.Justification.RIGHT,
                                       use_markup: true, label: "<small>" + _GTK("Forked by") + "</small>" }));
        rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: Gtk.Justification.LEFT,
                                        use_markup: true, label: "<small><a href=\"https://github.com/zhrexl\">zhrexl</a></small>" }));
                                                                        
        creditBox.append(leftBox);
        creditBox.append(rightBox);
        vbox.append(creditBox);
        
        // Translators: add your name here or keep it empty, it will be displayed in about page, e.g.
        // msgstr ""
        // "translator1\n"
        // "<a href=\"mailto:translator2@mail.org\">translator2</a>\n"
        // "<a href=\"https://...\">translator3</a>"
        if (_("translator-credits") != "translator-credits" && _("translator-credits") != "") {
            leftBox.append(new Gtk.Label());
            rightBox.append(new Gtk.Label());
            leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: 1, use_markup: true, label: "<small>" + _GTK("Translated by") + "</small>" }));
            rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: 0, use_markup: true, label: "<small>" + _("translator-credits") + "</small>" }));
        }
    }
});


