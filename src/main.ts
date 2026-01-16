import { FileView, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, NovelSettings, SampleSettingTab as NovelSettingTab } from "./settings";
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { join } from 'path';
import { NOVEL_VIEW_TYPE, NovelView } from 'novel-view';
import { DummyView, TXT_VIEW_TYPE } from 'dummy-txt-view';
import { QUERY_VIEW_TYPE, QueryView } from 'query-view';
import { TYPESCRIPT_VIEW, TypescriptView } from 'typescript-view';
import { Failure, FailureWith, Success } from 'utils/success';

// Remember to rename these classes and interfaces!

export default class NovelPlugin extends Plugin {
    settings: NovelSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new NovelSettingTab(this.app, this));

        this.registerTxtView();
        this.registerTsView();
        this.registerNovelView();
        this.registerQueryView();
    }

    private registerTxtView() {
        this.registerView(TXT_VIEW_TYPE, (leaf) => new DummyView(leaf));
        this.registerHoverLinkSource(TXT_VIEW_TYPE, { display: "Plain Text", defaultMod: true });
        this.registerExtensions(["txt"], TXT_VIEW_TYPE);
    }

    private registerTsView() {
        this.registerView(TYPESCRIPT_VIEW, (leaf) => new TypescriptView(leaf, this.runJS));
        this.registerExtensions(["ts"], TYPESCRIPT_VIEW);

        this.addCommand({
            id: "open-ts-repl",
            name: "Open TS Repl",
            callback: async () => {
                const l = this.app.workspace.getLeaf();
                await l.setViewState({
                    type: TYPESCRIPT_VIEW,
                    active: true
                });
                this.app.workspace.revealLeaf(l);
            }
        });
    }

    runJS(javascript: string, context: any): Success<any, any> {
        const vm = require("node:vm");
        const vmContext = vm.createContext(context);

        try {
            const result = vm.runInContext(javascript, vmContext);
            return Success(result);
        } catch (e) {
            return FailureWith(e)
        }
    }

    private registerNovelView() {
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

        const infoEl = this.addStatusBarItem();
        infoEl.createSpan({ text: "--" });

        const updateInfoEl = (view: NovelView) => {
            const estimates = view.getEstimates();
            infoEl.innerText = `${estimates.lineCount} lines for ${Math.floor(estimates.duration.asMinutes())}min runtime`;
            infoEl.style.display = "initial";
        };

        let previousInterval: number | undefined = undefined;

        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf?.view instanceof NovelView) {
                const view = leaf.view as NovelView;
                if (previousInterval) {
                    window.clearInterval(previousInterval);
                }
                const interval = window.setInterval(() => updateInfoEl(view), 2000);
                previousInterval = interval;
                view.registerInterval(interval);
                updateInfoEl(view);
            } else {
                infoEl.style.display = "none";
            }
        }));
    }

    private registerQueryView() {
        this.registerView(QUERY_VIEW_TYPE, (leaf) => new QueryView(leaf));
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

