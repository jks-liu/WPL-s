const shareBtn = document.getElementById('share');
const openBtn = document.getElementById('open');
const upvoteCode = document.getElementById('upvote');
const vscode = acquireVsCodeApi();

function answerUpvote(id) {
	vscode.postMessage({
		command: 'upvoteAnswer',
		id: id
	})
}

function articleUpvote(id) {
	vscode.postMessage({
		command: 'upvoteArticle',
		id: id
	})
}

shareBtn.addEventListener('click', e => {
	vscode.postMessage({
		command: 'share'
	})
})
openBtn.addEventListener('click', e => {
	vscode.postMessage({
		command: 'open'
	})
})



