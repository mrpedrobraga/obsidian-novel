import { FileView, Notice, Plugin, TFile, View } from 'obsidian';
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
                        .setTitle('New Script')
                        .setIcon('document')
                        .onClick(async () => {
                            (this.app as any).commands.executeCommandById('novel:new-file');
                        });
                });
            })
        );

        this.addCommand({
            id: "new-file",
            name: "New Script",
            callback: async () => {
                const leaf = this.app.workspace.getMostRecentLeaf();
                const folder = leaf?.view instanceof FileView
                    ? leaf.view.file?.parent
                    : this.app.vault.getRoot();

                if (!folder) return;

                let base = "Untitled";
                let path = `${folder.path}/${base}.nov`;
                let i = 1;

                while (this.app.vault.getAbstractFileByPath(path)) {
                    path = `${folder.path}/${base} ${i++}.nov`;
                }

                const file = await this.app.vault.create(path, "");
                const l = this.app.workspace.getLeaf(true);
                await l.openFile(file);
                this.app.workspace.setActiveLeaf(l);
            }
        });

        this.addCommand({
            id: "novel-find",
            name: "Find in script",
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

