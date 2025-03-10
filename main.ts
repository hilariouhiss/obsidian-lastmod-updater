import { Plugin, TFile, PluginSettingTab, Setting, App } from "obsidian";

interface LastModUpdaterSettings {
	dateFormat: string;
	frontMatterDelimiter: string;
	debug: boolean;
}

const DEFAULT_SETTINGS: LastModUpdaterSettings = {
	dateFormat: "YYYY-MM-DD HH:mm",
	frontMatterDelimiter: "---",
	debug: false,
};

function formatDate(date: Date, format: string): string {
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const seconds = date.getSeconds().toString().padStart(2, "0");

	return format
		.replace("YYYY", year.toString())
		.replace("MM", month)
		.replace("DD", day)
		.replace("HH", hours)
		.replace("mm", minutes)
		.replace("ss", seconds);
}

export default class LastModUpdaterPlugin extends Plugin {
	settings: LastModUpdaterSettings;
	private isUpdating = new Set<string>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LastModUpdaterSettingTab(this.app, this));

		// 如果用户设置的分隔符为空，则使用默认值
		if (!this.settings.frontMatterDelimiter.trim()) {
			console.warn('Front Matter 分隔符为空，使用默认值 "---"');
			this.settings.frontMatterDelimiter =
				DEFAULT_SETTINGS.frontMatterDelimiter;
		}

		this.registerEvent(
			this.app.vault.on("modify", async (file: TFile) => {
				if (file.extension !== "md") return;
				if (this.isUpdating.has(file.path)) return;

				try {
					const content = await this.app.vault.read(file);
					if (
						!content ||
						!content.startsWith(this.settings.frontMatterDelimiter)
					)
						return;

					const delimiter = this.settings.frontMatterDelimiter;
					// 使用正则表达式匹配 Front Matter 块，确保分隔符在单独的一行
					const fmRegex = new RegExp(
						`^${delimiter}\\s*\\n([\\s\\S]*?)\\n${delimiter}`,
						"m"
					);
					const match = content.match(fmRegex);
					if (!match) {
						if (this.settings.debug)
							console.debug(
								`未找到有效的 Front Matter 块: ${file.path}`
							);
						return;
					}

					// 获取 Front Matter 块在文件中的起止位置
					const fullMatch = match[0];
					const frontMatterStart = content.indexOf(fullMatch);
					const frontMatterEnd = frontMatterStart + fullMatch.length;
					let frontMatter = content.substring(
						frontMatterStart,
						frontMatterEnd
					);
					const restContent = content.substring(frontMatterEnd);

					// 格式化当前日期
					const currentDate = formatDate(
						new Date(),
						this.settings.dateFormat
					);

					// 正则匹配 lastmod 字段（多行匹配模式）
					const lastmodRegex = /^lastmod:\s*.*$/m;
					if (lastmodRegex.test(frontMatter)) {
						frontMatter = frontMatter.replace(
							lastmodRegex,
							`lastmod: ${currentDate}`
						);
					} else {
						// 尝试在 closing delimiter 之前插入 lastmod 字段
						const closingDelimiterRegex = new RegExp(
							`\\n${delimiter}\\s*$`
						);
						if (closingDelimiterRegex.test(frontMatter)) {
							frontMatter = frontMatter.replace(
								closingDelimiterRegex,
								`\nlastmod: ${currentDate}\n${delimiter}`
							);
						} else {
							// 如果没有匹配到关闭分隔符，则直接追加
							frontMatter += `\nlastmod: ${currentDate}\n`;
						}
					}

					const newContent =
						content.substring(0, frontMatterStart) +
						frontMatter +
						restContent;
					this.isUpdating.add(file.path);
					await this.app.vault.modify(file, newContent);
					if (this.settings.debug)
						console.debug(
							`更新文件 ${file.path} 的 lastmod 为 ${currentDate}`
						);
				} catch (error) {
					console.error(`更新文件失败: ${file.path}`, error);
				} finally {
					this.isUpdating.delete(file.path);
				}
			})
		);
	}

	onunload() {
		// 通过 registerEvent 注册的事件会自动清理，无需手动移除
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class LastModUpdaterSettingTab extends PluginSettingTab {
	plugin: LastModUpdaterPlugin;

	constructor(app: App, plugin: LastModUpdaterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("日期格式")
			.setDesc("例如：YYYY-MM-DD HH:mm 或 YYYY/MM/DD")
			.addText((text) =>
				text
					.setPlaceholder("输入日期格式")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat =
							value.trim() || DEFAULT_SETTINGS.dateFormat;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Front Matter 分隔符")
			.setDesc("例如：--- 或 +++，必须在单独一行")
			.addText((text) =>
				text
					.setPlaceholder("输入分隔符")
					.setValue(this.plugin.settings.frontMatterDelimiter)
					.onChange(async (value) => {
						this.plugin.settings.frontMatterDelimiter =
							value.trim() ||
							DEFAULT_SETTINGS.frontMatterDelimiter;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("调试模式")
			.setDesc("启用后在控制台输出调试信息")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
