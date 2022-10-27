/*
 * Copyright 2022 zhrexl
 * Originally Forked from Abakkk
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

const ExtensionUtils  = imports.misc.extensionUtils;
const Me              = ExtensionUtils.getCurrentExtension();
const Prefs           = Me.imports.ui.preferencespage;
const Drawpage        = Me.imports.ui.drawingpage;
const AboutPage        = Me.imports.ui.about;



function init()
{
    ExtensionUtils.initTranslations(Me.metadata.uuid);
}


function fillPreferencesWindow(window)
{
    let page1 = new Prefs.Preferences();
    let page2 = new Drawpage.DrawingPage();
    let page3 = new AboutPage.AboutPage();

    window.add(page1);
    window.add(page2);
    window.add(page3);
}


