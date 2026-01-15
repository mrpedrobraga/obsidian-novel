import { App, PluginSettingTab, Setting } from "obsidian";
import NovelPlugin from "./main";

export interface NovelSettings {
    testSetting: string;
}

export const DEFAULT_SETTINGS: NovelSettings = {
    testSetting: 'default'
}

export class SampleSettingTab extends PluginSettingTab {
    plugin: NovelPlugin;

    constructor(app: App, plugin: NovelPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Example Setting')
            .setDesc('A simple setting to test the setting capabilities.')
            .addText(text => text
                .setPlaceholder('Insert placeholder here...')
                .setValue(this.plugin.settings.testSetting)
                .onChange(async (value) => {
                    this.plugin.settings.testSetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
