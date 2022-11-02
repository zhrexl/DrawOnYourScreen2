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
const { Adw, Gtk, GObject }= imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const _ = gettext;

const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_start: MARGIN, margin_end: MARGIN, spacing: 4 };

//TODO: Follow GNOME HIG for About Pages
var AboutPage = GObject.registerClass({
    GTypeName: 'About'
}, class AboutPage extends Adw.PreferencesPage {
    constructor() {
        super({});
        this.set_title( _("About"));
        this.set_name('about');
        this.set_icon_name("dialog-question-symbolic");

        let aboutGroup = Adw.PreferencesGroup.new();
        let scrolledWindow = Gtk.ScrolledWindow.new();

        scrolledWindow.set_vexpand(true);
        scrolledWindow.hscrollbar_policy= Gtk.PolicyType.NEVER;

        aboutGroup.add(scrolledWindow);

        let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 3 * MARGIN, margin_bottom: 3 * MARGIN, margin_start: 3 * MARGIN, margin_end: 3 * MARGIN });
        scrolledWindow.set_child(vbox);

        // Translators: you are free to translate the extension name, that is displayed in About page, or not
        let name = "<b> " + _("Draw On You Screen 2") + "</b>";
        // Translators: version number in "About" page
        let version = _("Version %f").format(Me.metadata.version);
        // Translators: you are free to translate the extension description, that is displayed in About page, or not
        let description = _("This is a forked from Abakkk original Draw On Your Screen Extension.\nStart drawing with Super+Alt+D and save your beautiful work by taking a screenshot");
        let link = "<span><a href=\"" + Me.metadata.url + "\">" + Me.metadata.url + "</a></span>";
        let licenseName = _("GNU General Public License, version 3 or later");
        let licenseLink = "https://www.gnu.org/licenses/gpl-3.0.html";
        let license = "<small>" + _("This program comes with absolutely no warranty.\nSee the <a href=\"%s\">%s</a> for details.").format(licenseLink, licenseName) + "</small>";

        let aboutLabel = new Gtk.Label({ wrap: true, justify: Gtk.Justification.CENTER, use_markup: true, label:
            name + "\n\n" + version + "\n\n" + description + "\n\n" + link + "\n\n" + license + "\n" });

        vbox.append(aboutLabel);

        let creditBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 2 * MARGIN, margin_bottom: 2 * MARGIN, margin_start: 2 * MARGIN, margin_end: 2 * MARGIN, spacing: 5 });
        let leftBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        let rightBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: Gtk.Justification.RIGHT,
                                       use_markup: true, label: "<small>" + _("Created by") + "</small>" }));
        rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: Gtk.Justification.LEFT,
                                        use_markup: true, label: "<small><a href=\"https://codeberg.org/abak\">Abakkk</a></small>" }));

        leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: Gtk.Justification.RIGHT,
                                       use_markup: true, label: "<small>" + _("Forked by") + "</small>" }));
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
            leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: 1, use_markup: true, label: "<small>" + _("Translated by") + "</small>" }));
            rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: 0, use_markup: true, label: "<small>" + _("translator-credits") + "</small>" }));
        }
        this.add(aboutGroup);
       }
  });

