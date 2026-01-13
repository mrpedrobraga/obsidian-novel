import { Notice, Plugin, View } from 'obsidian';
import { DEFAULT_SETTINGS, NovelSettings, SampleSettingTab as NovelSettingTab } from "./settings";
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { join } from 'path';
import { NOVEL_VIEW_TYPE, NovelView } from 'novel-view';

// Remember to rename these classes and interfaces!

export default class NovelPlugin extends Plugin {
    settings: NovelSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new NovelSettingTab(this.app, this));

        this.registerView(NOVEL_VIEW_TYPE, (leaf) => new NovelView(leaf));
        this.registerHoverLinkSource(NOVEL_VIEW_TYPE, { display: "Novel Editor", defaultMod: true });

        this.registerExtensions(["nov", "novel"], NOVEL_VIEW_TYPE);

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                menu.addItem((item) => {
                    item
                        .setTitle('New `novel` script!')
                        .setIcon('document')
                        .onClick(async () => {
                            this.app.vault.create(
                                join(file.path, 'Untitled.nov'),
                                "== First Scene ==\n\nSomething was happening..."
                            )
                            new Notice(file.path);
                        });
                });
            })
        );

        this.addCommand({
            id: "novel-find",
            name: "Find in novel",
            hotkeys: [{ modifiers: ["Mod"], key: "f" }],
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(NovelView);
                if (!view) return false;

                if (!checking) {
                    view.openSearch();
                }
                return true;
            }
        });
    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<NovelSettings>);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

