import { shell } from 'electron';

const handleAnchorClick = ({ Meteor }) => (event) => {
	const a = event.target.closest('a');

	if (!a) {
		return;
	}

	const href = a.getAttribute('href');
	const download = a.hasAttribute('download');

	const isInsideDomain = Meteor && RegExp(`^${ Meteor.absoluteUrl() }`).test(href);
	const isRelative = !/^([a-z]+:)?\/\//.test(href);
	if (isInsideDomain && isRelative) {
		return;
	}

	const isFileUpload = /^\/file-upload\//.test(href) && !download;
	if (isFileUpload) {
		const clone = a.cloneNode();
		clone.setAttribute('download', 'download');
		clone.click();
		return;
	}

	const isLocalFilePath = /^file:\/\/.+/.test(href);
	if (isLocalFilePath) {
		const filePath = href.slice(6);
		shell.showItemInFolder(filePath);
		event.preventDefault();
		return;
	}

	shell.openExternal(href);
	event.preventDefault();
};


export default (window) => {
	window.addEventListener('load', () => {
		window.document.addEventListener('click', handleAnchorClick(window), true);
	});
};
