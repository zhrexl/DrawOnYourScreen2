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

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import PreferencesPage from './ui/preferencespage.js';
import DrawingPage from './ui/drawingpage.js';
import AboutPage from './ui/about.js';


export default class DrawOnYourScreenExtensionPreferences extends ExtensionPreferences {

    constructor(metadata) {
        super(metadata);
        this.initTranslations();
    }
    
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        window.search_enabled = true;

        let page1 = new PreferencesPage(this);
        let page2 = new DrawingPage(this, window);
        let page3 = new AboutPage(this);

        window.add(page1);
        window.add(page2);
        window.add(page3);
    }
}
