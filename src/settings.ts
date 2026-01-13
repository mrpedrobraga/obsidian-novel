import { App, PluginSettingTab, Setting } from "obsidian";
import NovelPlugin from "./main";

export interface NovelSettings {
    mySetting: string;
}

export const DEFAULT_SETTINGS: NovelSettings = {
    mySetting: 'default'
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
            .setName('Settings #1')
            .setDesc('It\'s a secret')
            .addText(text => text
                .setPlaceholder('Enter your secret')
                .setValue(this.plugin.settings.mySetting)
                .onChange(async (value) => {
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
