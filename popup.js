let vowelize = document.getElementById("vowelize");

// When the button is clicked, inject hebrew with nekudot into page
vowelize?.addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: setNekudot,
    });
});

function setNekudot() {

    /**
     * Helper to conveniently iterate a tree walker
     *
     * @param {TreeWalker} walker
     * @returns {IterableIterator}
     */
    function iterateWalker(walker) {
        return {
            [Symbol.iterator]() {
                return this
            },

            next() {
                const value = walker.nextNode()
                return {value, done: !value}
            }
        }
    }

    /**
     * Get the text nodes contained in a given range
     *
     * @param {Range} range
     * @returns {Text[]}
     */
    function getSelectedNodes(range) {
        const walker = document.createTreeWalker(
            range.commonAncestorContainer.parentElement,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    return range.intersectsNode(node)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT
                }
            }
        )

        return [...iterateWalker(walker)]
    }

    /**
     * Test if a given node has some actual
     * text other than whitespace
     *
     * @param {Node} node
     * @returns {boolean}
     */
    function hasText(node) {
        return /\S/.test(node.textContent)
    }

    function splitWords(string) {
        if (!string) {
            string = this;
        }
        string = string.trim()
        let suffix = (/[\?\.\!]/).test(string[string.length - 1]) ? '' : '.'
        let result = string.concat(suffix).match(/.*?[\.\s\?\!]+?/g)

        result = result ? result.map((str) => str.trim()).filter((str) => str !== '') : [string.trim()]

        let lastString = result[result.length - 1]
        if (suffix === '.') {
            result[result.length - 1] = lastString.substring(0, lastString.length - 1)
        }
        return result
    }

    function splitResultWords(result) {
        return splitWords(result.join(''))
    }

    String.prototype.splitWords = splitWords;

    function insertResult(resultList, selection, selectedNodes) {
        let [firstNode, lastNode] = [selectedNodes[0], selectedNodes[selectedNodes.length - 1]]

        let [startOffset, endOffset] = [selection.anchorOffset, selection.extentOffset]

        let isForwardSelection = selection.anchorNode === selectedNodes[0]
        if (selectedNodes.length === 1 && startOffset > endOffset) {
            isForwardSelection = false
        }

        if (!isForwardSelection) {
            [startOffset, endOffset] = [endOffset, startOffset]
        }

        selectedNodes.map((node) => {
            if (!hasText(node)) {
                return
            }

            let nodeText = node.textContent

            let isFirstNode = node === firstNode
            let isLastNode = node === lastNode

            let startPt = isFirstNode ? startOffset : 0
            let endPt = isLastNode ? endOffset : nodeText.length
            let length = endPt - startPt

            let nWords = nodeText.substr(startPt, length).splitWords().length

            let startStr = nodeText.substr(0, startPt)
            let middleStr = resultList.splice(0, nWords).join(' ')
            let endStr = nodeText.substr(endPt)

            node.textContent = startStr.concat(middleStr, endStr)
            return node
        })
    }

    function buildString(selection, selectedNodes) {
        let [firstNode, lastNode] = [selectedNodes[0], selectedNodes[selectedNodes.length - 1]]
        let [startOffset, endOffset] = [selection.anchorOffset, selection.extentOffset]

        let isForwardSelection = selection.anchorNode === selectedNodes[0]
        if (selectedNodes.length === 1 && startOffset > endOffset) {
            isForwardSelection = false
        }

        if (!isForwardSelection) {
            [startOffset, endOffset] = [endOffset, startOffset]
        }
        let builtString = ''

        selectedNodes.map((node) => {
            if (!hasText(node)) {
                return
            }

            let nodeText = node.textContent

            let isFirstNode = node === firstNode
            let isLastNode = node === lastNode

            let startPt = isFirstNode ? startOffset : 0
            let endPt = isLastNode ? endOffset : nodeText.length
            let length = endPt - startPt

            builtString = builtString + ' ' + nodeText.substr(startPt, length)

        })

        return builtString
    }

    let selection = window.getSelection();

    const range = selection.getRangeAt(0)
    const selectedNodes = getSelectedNodes(range)
    const selectedHebrew = buildString(selection, selectedNodes) // range.toString() would concat lines sometimes

    chrome.runtime.sendMessage({text: selectedHebrew}, function (result) {
        let resultText = result['processed']
        resultText = splitResultWords([resultText])
        insertResult(resultText, selection, selectedNodes)

    })
}