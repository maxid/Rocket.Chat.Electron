import fs from 'fs';
import path from 'path';
import spellchecker from 'spellchecker';
import { clipboard, remote, shell, webFrame } from 'electron';
import i18n from '../i18n/index';
const { app, dialog, getCurrentWebContents, getCurrentWindow, Menu } = remote;


const applySpellCheckSuggestion = (suggestion) => {
	getCurrentWebContents().replaceMisspelling(suggestion);
};

const downloadUrl = (url) => {
	getCurrentWebContents().downloadURL(url);
};

const openLink = (url) => {
	shell.openExternal(url);
};

const copyLinkText = (text) => {
	clipboard.write({ text, bookmark: text });
};

const copyLinkAddress = (url, text) => {
	clipboard.write({ text: url, bookmark: text });
};


const createMenuTemplate = ({
	isEditable,
	selectionText,
	mediaType,
	srcURL,
	linkURL,
	linkText,
	editFlags: {
		canUndo = false,
		canRedo = false,
		canCut = false,
		canCopy = false,
		canPaste = false,
		canSelectAll = false,
	} = {},
	availableDictionaries = [],
	enabledDictionaries = [],
	spellingSuggestions = null,
} = {}, {
	applySpellCheckSuggestion,
	toggleSpellCheckLanguage,
	loadSpellCheckDictionaries,
	downloadUrl,
	openLink,
	copyLinkText,
	copyLinkAddress,
} = {}) => [
	...(Array.isArray(spellingSuggestions) ? [
		...(spellingSuggestions.length > 0 ? (
			spellingSuggestions.slice(0, 6).map((suggestion) => ({
				label: suggestion,
				click: () => applySpellCheckSuggestion(suggestion),
			}))
		) : (
			[
				{
					label: i18n.__('No_suggestions'),
					enabled: false,
				},
			]
		)),
		...(spellingSuggestions.length > 6 ? [
			{
				label: i18n.__('More_spelling_suggestions'),
				submenu: spellingSuggestions.slice(6).map((suggestion) => ({
					label: suggestion,
					click: () => applySpellCheckSuggestion(suggestion),
				})),
			},
		] : []),
		{
			type: 'separator',
		},
	] : []),
	...(isEditable && selectionText === '' ? [
		{
			label: i18n.__('Spelling_languages'),
			enabled: availableDictionaries.length > 0,
			submenu: availableDictionaries.map((language) => ({
				label: language,
				type: 'checkbox',
				checked: enabledDictionaries.includes(language),
				click: ({ checked }) => toggleSpellCheckLanguage(language, checked),
			})),
		},
		{
			label: i18n.__('Browse_for_language'),
			click: () => loadSpellCheckDictionaries(),
		},
		{
			type: 'separator',
		},
	] : []),
	...(mediaType === 'image' ? [
		{
			label: i18n.__('Save image as...'),
			click: () => downloadUrl(srcURL),
		},
		{
			type: 'separator',
		},
	] : []),
	...(linkURL ? [
		{
			label: i18n.__('Open link'),
			click: () => openLink(linkURL),
		},
		{
			label: i18n.__('Copy link text'),
			click: () => copyLinkText(linkText),
			enabled: !!linkText,
		},
		{
			label: i18n.__('Copy link address'),
			click: () => copyLinkAddress(linkURL, linkText),
		},
		{
			type: 'separator',
		},
	] : []),
	{
		label: i18n.__('&Undo'),
		role: 'undo',
		accelerator: 'CommandOrControl+Z',
		enabled: canUndo,
	},
	{
		label: i18n.__('&Redo'),
		role: 'redo',
		accelerator: process.platform === 'win32' ? 'Control+Y' : 'CommandOrControl+Shift+Z',
		enabled: canRedo,
	},
	{
		type: 'separator',
	},
	{
		label: i18n.__('Cu&t'),
		role: 'cut',
		accelerator: 'CommandOrControl+X',
		enabled: canCut,
	},
	{
		label: i18n.__('&Copy'),
		role: 'copy',
		accelerator: 'CommandOrControl+C',
		enabled: canCopy,
	},
	{
		label: i18n.__('&Paste'),
		role: 'paste',
		accelerator: 'CommandOrControl+V',
		enabled: canPaste,
	},
	{
		label: i18n.__('Select &all'),
		role: 'selectall',
		accelerator: 'CommandOrControl+A',
		enabled: canSelectAll,
	},
];


const localStorage = {
	getItem(key) {
		try {
			return window.localStorage.getItem(key);
		} catch (e) {
			console.error(e);
			return null;
		}
	},

	setItem(key, value) {
		try {
			window.localStorage.setItem(key, value);
		} catch (e) {
			console.error(e);
		}
	},
};


const contractions = [
	"ain't", "aren't", "can't", "could've", "couldn't", "couldn't've", "didn't", "doesn't", "don't", "hadn't",
	"hadn't've", "hasn't", "haven't", "he'd", "he'd've", "he'll", "he's", "how'd", "how'll", "how's", "I'd",
	"I'd've", "I'll", "I'm", "I've", "isn't", "it'd", "it'd've", "it'll", "it's", "let's", "ma'am", "mightn't",
	"mightn't've", "might've", "mustn't", "must've", "needn't", "not've", "o'clock", "shan't", "she'd", "she'd've",
	"she'll", "she's", "should've", "shouldn't", "shouldn't've", "that'll", "that's", "there'd", "there'd've",
	"there're", "there's", "they'd", "they'd've", "they'll", "they're", "they've", "wasn't", "we'd", "we'd've",
	"we'll", "we're", "we've", "weren't", "what'll", "what're", "what's", "what've", "when's", "where'd",
	"where's", "where've", "who'd", "who'll", "who're", "who's", "who've", "why'll", "why're", "why's", "won't",
	"would've", "wouldn't", "wouldn't've", "y'all", "y'all'd've", "you'd", "you'd've", "you'll", "you're", "you've",
].reduce((map, word) => ({ ...map, [word.replace(/'.*/, '')]: true }), {});


class SpellCheck {
	constructor() {
		this.enabledDictionaries = [];
		this.loadAvailableDictionaries();
		this.setEnabledDictionaries();
	}

	isMultiLanguage() {
		return this.availableDictionaries.length > 0 && process.platform !== 'win32';
	}

	loadAvailableDictionaries() {
		this.availableDictionaries = spellchecker.getAvailableDictionaries().sort();
		if (this.availableDictionaries.length === 0) {
			// Dictionaries path is correct for build
			this.dictionariesPath = path.join(
				app.getAppPath(),
				app.getAppPath().endsWith('app.asar') ? '..' : '.',
				'dictionaries'
			);
			this.getDictionariesFromInstallDirectory();
		} else {
			this.availableDictionaries = this.availableDictionaries.map((dict) => dict.replace('-', '_'));
		}
	}

	/**
	 * Set enabled dictionaries on load
	 * Either sets enabled dictionaries to saved preferences, or enables the first
	 * dictionary that is valid based on system (defaults to en_US)
	 */
	setEnabledDictionaries() {
		const { dictionaries } = this;
		if (dictionaries) {
			// Dictionary disabled
			if (dictionaries.length === 0) {
				return;
			}
			if (this.setEnabled(dictionaries)) {
				return;
			}
		}

		if (this.userLanguage) {
			if (this.setEnabled(this.userLanguage)) {
				return;
			}
			if (this.userLanguage.includes('_') && this.setEnabled(this.userLanguage.split('_')[0])) {
				return;
			}
		}

		const navigatorLanguage = navigator.language.replace('-', '_');
		if (this.setEnabled(navigatorLanguage)) {
			return;
		}

		if (navigatorLanguage.includes('_') && this.setEnabled(navigatorLanguage.split('_')[0])) {
			return;
		}

		if (this.setEnabled('en_US')) {
			return;
		}

		if (!this.setEnabled('en')) {
			console.info('Unable to set a language for the spell checker - Spell checker is disabled');
		}

	}

	get userLanguage() {
		const language = localStorage.getItem('userLanguage');
		return language ? language.replace('-', '_') : null;
	}

	get dictionaries() {
		const dictionaries = localStorage.getItem('spellcheckerDictionaries');
		const result = JSON.parse(dictionaries || '[]');
		return Array.isArray(result) ? result : [];
	}

	/**
     * Installs all of the dictionaries specified in filePaths
     * Copies dicts into our dictionary path and adds them to availableDictionaries
     */
	installDictionariesFromPaths(dictionaryPaths) {
		for (const dictionaryPath of dictionaryPaths) {
			const dictionaryFileName = dictionaryPath.split(path.sep).pop();
			const dictionaryName = dictionaryFileName.slice(0, -4);
			const newDictionaryPath = path.join(this.dictionariesPath, dictionaryFileName);

			this.copyDictionaryToInstallDirectory(dictionaryName, dictionaryPath, newDictionaryPath);
		}
	}

	copyDictionaryToInstallDirectory(dictionaryName, oldPath, newPath) {
		fs.createReadStream(oldPath).pipe(fs.createWriteStream(newPath)
			.on('error', (errorMessage) => {
				dialog.showErrorBox(i18n.__('Error'), `${ i18n.__('Error copying dictionary file') }: ${ dictionaryName }`);
				console.error(errorMessage);
			})
			.on('finish', () => {
				if (!this.availableDictionaries.includes(dictionaryName)) {
					this.availableDictionaries.push(dictionaryName);
				}
			}));
	}

	getDictionariesFromInstallDirectory() {
		if (this.dictionariesPath) {
			const fileNames = fs.readdirSync(this.dictionariesPath);
			for (const fileName of fileNames) {
				const dictionaryExtension = fileName.slice(-3);
				const dictionaryName = fileName.slice(0, -4);
				if (!this.availableDictionaries.includes(dictionaryName)
                    && (dictionaryExtension === 'aff' || dictionaryExtension === 'dic')) {
					this.availableDictionaries.push(dictionaryName);
				}
			}
		}
	}

	setEnabled(dictionaries) {
		dictionaries = [].concat(dictionaries);
		let result = false;
		for (let i = 0; i < dictionaries.length; i++) {
			if (this.availableDictionaries.includes(dictionaries[i])) {
				result = true;
				this.enabledDictionaries.push(dictionaries[i]);
				// If using Hunspell or Windows then only allow 1 language for performance reasons
				if (!this.isMultiLanguage()) {
					this.enabledDictionaries = [dictionaries[i]];
					spellchecker.setDictionary(dictionaries[i], this.dictionariesPath);
					return true;
				}
			}
		}
		return result;
	}

	disable(dictionary) {
		const index = this.enabledDictionaries.indexOf(dictionary);
		if (index > -1) {
			this.enabledDictionaries.splice(index, 1);
		}
	}

	enable() {
		webFrame.setSpellCheckProvider('', false, {
			spellCheck: (text) => this.isCorrect(text),
		});

		this.setupContextMenuListener();
	}

	saveEnabledDictionaries() {
		localStorage.setItem('spellcheckerDictionaries', JSON.stringify(this.enabledDictionaries));
	}

	isCorrect(text) {
		if (!this.enabledDictionaries.length || contractions[text.toLocaleLowerCase()]) {
			return true;
		}

		if (this.isMultiLanguage()) {
			for (let i = 0; i < this.enabledDictionaries.length; i++) {
				spellchecker.setDictionary(this.enabledDictionaries[i]);
				if (!spellchecker.isMisspelled(text)) {
					return true;
				}
			}
		} else {
			return !spellchecker.isMisspelled(text);
		}
		return false;
	}

	getCorrections(text) {
		if (!this.isMultiLanguage()) {
			return spellchecker.getCorrectionsForMisspelling(text);
		}

		const allCorrections = this.enabledDictionaries.map((dictionary) => {
			spellchecker.setDictionary(dictionary);
			return spellchecker.getCorrectionsForMisspelling(text);
		}).filter((c) => c.length > 0);

		const length = Math.max(...allCorrections.map((a) => a.length));

		// Get the best suggestions of each language first
		const corrections = [];
		for (let i = 0; i < length; i++) {
			corrections.push(...allCorrections.map((c) => c[i]).filter((c) => c));
		}

		// Remove duplicates
		return [...new Set(corrections)];
	}

	setupContextMenuListener() {
		getCurrentWebContents().on('context-menu', (event, params) => {
			event.preventDefault();

			const actions = {
				applySpellCheckSuggestion,
				toggleSpellCheckLanguage: (language, checked) => {
					if (!this.isMultiLanguage()) {
						this.enabledDictionaries = [];
					}

					if (checked) {
						this.setEnabled(language);
					} else {
						this.disable(language);
					}

					this.saveEnabledDictionaries();
				},
				loadSpellCheckDictionaries: () => {
					dialog.showOpenDialog(
						getCurrentWindow(),
						{
							title: i18n.__('Open_Language_Dictionary'),
							defaultPath: this.dictionariesPath,
							filters: [
								{ name: 'Dictionaries', extensions: ['aff', 'dic'] },
							],
							properties: ['openFile', 'multiSelections'],
						},
						(filePaths) => {
							this.installDictionariesFromPaths(filePaths);
						}
					);
				},
				downloadUrl,
				openLink,
				copyLinkText,
				copyLinkAddress,
			};

			const template = createMenuTemplate({
				...params,
				availableDictionaries: this.availableDictionaries,
				enabledDictionaries: this.enabledDictionaries,
				spellingSuggestions: (({ isEditable, selectionText }) => {
					if (!isEditable || selectionText === '') {
						return null;
					}

					const text = selectionText.toString().trim();

					if (text === '' || this.isCorrect(text)) {
						return null;
					}

					return this.getCorrections(text);
				})(params),
			}, actions);

			const menu = Menu.buildFromTemplate(template);
			menu.popup({ window: getCurrentWindow() });
		}, false);
	}
}

export default SpellCheck;
