// Initialize button with users's prefered color


let vowelize = document.getElementById("vowelize");

// When the button is clicked, inject setPageBackgroundColor into current page
vowelize.addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: setPageBackgroundColor,
    });
});

const contains_heb = (str) => (/[\u0590-\u05FF]/).test(str)

const getAllHebrewElements = () => {

    // To select all elements containing hebrew text.
    // Abandoned in favour of only replacing highlighted text.
    var textTags = document.querySelectorAll("h1, h2, h3, h4, h5, p, li, td, caption, span, a");

    for (let i = 0; i < textTags.length; i++) {
        if (contains_heb(textTags[i].innerHTML)) {
            // console.log(textTags[i].textContent)
        }
    }
    return textTags
}


// The body of this function will be executed as a content script inside the
// current page
function setPageBackgroundColor() {

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

        let suffix = string.trim()[string.length - 1] === '.' ? '' : '.'
        let result = string.trim().concat(suffix).match(/.*?[\.\s]+?/g)

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
        // console.log('-----------------------------------------------')
        // console.log("nNodes", selectedNodes.length)
        let [firstNode, lastNode] = [selectedNodes[0], selectedNodes[selectedNodes.length - 1]]
        // console.log("firstNode, lastNode: ", firstNode, lastNode)

        let [startOffset, endOffset] = [selection.anchorOffset, selection.extentOffset]
        // console.log("Initial offsets", selection.anchorOffset, selection.extentOffset)

        let isForwardSelection = selection.anchorNode === selectedNodes[0]
        if (selectedNodes.length === 1 && startOffset > endOffset) {
            isForwardSelection = false
        }
        // console.log("isForwardSelection: ", isForwardSelection)

        if (!isForwardSelection) {
            [startOffset, endOffset] = [endOffset, startOffset]
        }
        // console.log("Post processed offsets: ", startOffset, endOffset)

        // console.log('Results: ', resultList)

        selectedNodes.map((node) => {
            if (!hasText(node)) {
                // console.log('skipping non text node: ', node)
                return
            }

            let nodeText = node.textContent
            // console.log("Nodetext: ", nodeText, nodeText.length)

            let isFirstNode = node === firstNode
            let isLastNode = node === lastNode
            // console.log("isFirstNode, isLastNode: ", isFirstNode, isLastNode)

            let startPt = isFirstNode ? startOffset : 0
            let endPt = isLastNode ? endOffset : nodeText.length
            let length = endPt - startPt
            // console.log("startPt, endPt: ", startPt, endPt)

            let nWords = nodeText.substr(startPt, length).splitWords().length
            // console.log(nodeText.substr(startPt, length))
            // console.log("Split Node Text to replace: ", nodeText.substr(startPt, length).splitWords(), nWords)

            let startStr = nodeText.substr(0, startPt)
            let middleStr = resultList.splice(0, nWords).join(' ')
            let endStr = nodeText.substr(endPt)

            node.textContent = startStr.concat(middleStr, endStr)
            // console.log("New node text: ", node.textContent)
            return node
        })


    }

    const Niqqud = {
        SHVA: '\u05B0',
        REDUCED_SEGOL: '\u05B1',
        REDUCED_PATAKH: '\u05B2',
        REDUCED_KAMATZ: '\u05B3',
        HIRIK: '\u05B4',
        TZEIRE: '\u05B5',
        SEGOL: '\u05B6',
        PATAKH: '\u05B7',
        KAMATZ: '\u05B8',
        HOLAM: '\u05B9',
        KUBUTZ: '\u05BB',
        SHURUK: '\u05BC',
        METEG: '\u05BD'
    }

    const extract_word = (k) => {
        const regex = Niqqud.KAMATZ + 'ו' + '(?=[א-ת])'

        if (k['options'][0]) {
            res = k['options'][0][0]
            res = res.replace('|', '')
            res = res.replace(Niqqud.KUBUTZ + 'ו' + Niqqud.METEG, 'ו' + Niqqud.SHURUK)
            res = res.replace(Niqqud.HOLAM + 'ו' + Niqqud.METEG, 'ו' + Niqqud.HOLAM)
            res = res.replace(Niqqud.METEG, '')
            res = res.replace(regex, 'ו' + Niqqud.HOLAM)
            res = res.replace(Niqqud.REDUCED_KAMATZ + 'ו', 'ו' + Niqqud.HOLAM)

            return res
        }
        return k['word']
    }

    let selection = window.getSelection();

    const range = selection.getRangeAt(0)
    const selectedNodes = getSelectedNodes(range)//.filter(hasText)

    const selectedHebrew = range.toString()
    console.log(selectedHebrew)
    console.log("Selection: ", selectedHebrew, selectedHebrew.length, selectedHebrew.splitWords().length)
    payload = {
        "task": "nakdan",
        "genre": "modern",
        "data": selectedHebrew,
        "addmorph": true,
        "keepqq": false,
        "nodageshdefmem": false,
        "patachma": false,
        "keepmetagim": true,
    }

    fetch("https://nakdan-2-0.loadbalancer.dicta.org.il/api", {
        method: "POST",
        body: JSON.stringify(payload), headers: {'content-type': 'text/plain;charset=UTF-8'}
    }).then(r => {
        return r.json()

    }).then(result => {
        let resultText = result.map(extract_word)
        resultText = splitResultWords(resultText)

        // console.log("Processed Response: ", resultText, resultText.length)

        insertResult(resultText, selection, selectedNodes)

    }).then(data => data);
}

